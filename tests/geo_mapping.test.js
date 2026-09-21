'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app.js');

const root = path.join(__dirname, '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const dataset = id => {
  const found = app.DATASETS.find(item => item.id === id);
  assert.ok(found, `dataset ${id} harus terdaftar`);
  return found;
};

const STATS = [
  'total-pemilih', 'total-pengguna', 'suara-total', 'suara-sah',
  'suara-tidak-sah', 'tps', 'validated-tps', 'blank-tps', 'outlier-vote-tps'
];

/* Kedua tahun memakai kontrak schema 2 yang sama; yang berbeda hanya awalan
   kunci, daftar kontes, dan jumlah opsi. Pemeriksaan di bawah menjalankan
   pemuat yang sama dua kali sehingga tidak ada jalur yang hanya teruji di satu
   tahun. */
function checkDataset(id, expectedContests, expectedPrefix) {
  const D = dataset(id);
  const wilayah = read(D.hierarchy);
  const election = read(D.election);

  assert.strictEqual(wilayah.schema, 2, `${id}: wilayah harus schema 2`);
  assert.strictEqual(election.schema, 2, `${id}: hasil harus schema 2`);
  assert.deepStrictEqual(wilayah.contests, expectedContests, `${id}: daftar kontes hierarki`);
  assert.deepStrictEqual(election.contests.map(contest => contest.id), expectedContests,
    `${id}: daftar kontes hasil`);
  assert.deepStrictEqual(election.stats, STATS, `${id}: nama statistik harus sama lintas tahun`);
  assert.strictEqual(
    typeof wilayah.key_prefix === 'string' ? wilayah.key_prefix : 'P',
    expectedPrefix, `${id}: awalan kunci`);

  app.S.root = app.buildTree(wilayah);
  app.installElectionData(election, D);
  const contests = app.normalizeContests(election.contests, D);
  assert.deepStrictEqual(contests.map(contest => contest.id), expectedContests);

  const firstProvince = app.S.root.anak[0];
  const firstKab = firstProvince.anak[0];
  const firstKec = firstKab.anak[0];
  assert.strictEqual(firstProvince.key, `${expectedPrefix}${wilayah.prov[0].k}`);
  assert.strictEqual(firstKab.key, `${firstProvince.key}.${wilayah.prov[0].kab[0].k}`);
  assert.strictEqual(firstKec.key, `${firstKab.key}.${wilayah.prov[0].kab[0].kec[0].k}`);
  if (firstKec.anak.length) {
    assert.strictEqual(firstKec.anak[0].key,
      `${firstKec.key}.${wilayah.prov[0].kab[0].kec[0].kel[0].k}`);
  }

  const kecNodes = [...app.S.nodes.values()].filter(node => node.lv === 3);
  assert.strictEqual(kecNodes.length, Object.keys(election.kec).length,
    `${id}: setiap kecamatan hierarki harus memiliki slot pada indeks hasil`);

  // Rollup nasional harus merupakan penjumlahan entri kecamatan eksak, bukan
  // generator, imputasi, atau pembagian proporsional.
  for (const contest of contests) {
    const rootResult = app.resultOf(app.S.root, contest.id);
    const expectedVotes = new Array(contest.opsi.length).fill(0);
    const expectedStats = new Array(election.stats.length).fill(0);
    let covered = 0;
    for (const node of kecNodes) {
      const row = election.kec[node.key];
      const entry = row && row[contest.sourceIndex];
      if (!entry) continue;
      covered++;
      contest.sourceIndexes.forEach((sourceIndex, outputIndex) => {
        expectedVotes[outputIndex] += Number(entry[0][sourceIndex] || 0);
      });
      expectedStats.forEach((_, index) => { expectedStats[index] += Number(entry[1][index] || 0); });
    }
    assert.deepStrictEqual(rootResult.votes, expectedVotes, `${id}/${contest.id}: rollup suara nasional salah`);
    assert.deepStrictEqual(rootResult.stats, expectedStats, `${id}/${contest.id}: rollup statistik nasional salah`);
    assert.strictEqual(rootResult.covered, covered, `${id}/${contest.id}: cakupan kecamatan salah`);
    assert.strictEqual(rootResult.total, kecNodes.length, `${id}/${contest.id}: denominator cakupan salah`);
  }

  // Data nol/hilang tidak boleh menghasilkan pemenang semu.
  const optionCount = contests[0].opsi.length;
  const missing = { lv: 4, key: 'TEST.MISSING', name: 'TANPA DATA', anak: [], parent: firstKec };
  assert.strictEqual(app.winnerOf(missing), null, `${id}: wilayah tanpa data tidak boleh punya pemenang`);
  const contestMap = app.S.results.get(app.S.pemilu);
  const tied = { lv: 4, key: 'TEST.TIED', name: 'SERI', anak: [], parent: firstKec };
  contestMap.set(tied.key, {
    votes: new Array(optionCount).fill(17), stats: new Array(election.stats.length).fill(0),
    present: true, covered: 1, total: 1
  });
  assert.deepStrictEqual(app.leadersOf(tied), [...Array(optionCount).keys()]);
  assert.strictEqual(app.winnerOf(tied), null, `${id}: seri tidak boleh diberikan kepada opsi pertama`);
  assert.strictEqual(app.isTie(tied), true);
  contestMap.delete(tied.key);

  const featureA = { properties: { key: firstKec.key } };
  const featureB = { properties: { key: firstKec.key } };
  assert.strictEqual(app.featureNode(featureA), firstKec, `${id}: fitur harus ditautkan lewat properties.key`);
  assert.strictEqual(app.featureNode(featureB), firstKec, `${id}: multipart boleh berbagi key yang sama`);
  assert.strictEqual(app.featureNode({ properties: { name: firstKec.name } }), null,
    `${id}: nama mirip tidak boleh dipakai sebagai resolver GIS`);
  return { wilayah, election, contests };
}

/* ── nomor dan kolom surat suara ─────────────────────────────────── */
const officialPartyNumbers = app.PARTY_SPEC.map(party => party.no);
assert.deepStrictEqual(officialPartyNumbers, [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14',
  '15', '16', '17', '18', '19', '20'
]);
assert.deepStrictEqual(app.PARTY_SPEC.map(party => party.column), [
  'pkb', 'gerinda', 'pdip', 'golkar', 'nasdem', 'garuda', 'berkarya', 'pks',
  'perindo', 'ppp', 'psi', 'pan', 'hanura', 'demokrat', 'pa', 'sira', 'pda', 'pna',
  'pbb', 'pkpi'
]);
assert.deepStrictEqual(app.PARTY_SPEC_2024.map(party => party.no),
  Array.from({ length: 24 }, (_, index) => String(index + 1)),
  'surat suara 2024 memuat 24 partai bernomor urut 1–24');
assert.deepStrictEqual(app.PARTY_SPEC_2024.map(party => party.column),
  Array.from({ length: 24 }, (_, index) => `partai-${index + 1}`),
  'kolom legislatif 2024 memakai kontrak partai-<nomor urut>');
assert.deepStrictEqual(app.PASLON_2024.map(option => option.column),
  ['paslon-1', 'paslon-2', 'paslon-3']);
// Warna paslon dipertahankan lintas tahun supaya toggle tahun tidak menukar
// arti warna: biru tetap tiket Prabowo, merah tetap tiket usungan PDI-P.
assert.strictEqual(app.PASLON_2019[1].warna, app.PASLON_2024[1].warna,
  'tiket Prabowo harus memakai warna yang sama pada 2019 dan 2024');
assert.strictEqual(app.PASLON_2019[0].warna, app.PASLON_2024[2].warna,
  'tiket usungan PDI-P harus memakai warna yang sama pada 2019 dan 2024');
assert.strictEqual(new Set(app.PASLON_2024.map(option => option.warna)).size, 3,
  'tiga paslon 2024 harus berbeda warna');

/* ── dua dataset ─────────────────────────────────────────────────── */
// Sumber 2019 tidak memuat DPD, jadi daftar kontes kini milik tiap dataset.
assert.deepStrictEqual(dataset('2019').contests, ['pilpres', 'dpr', 'dprdprov', 'dprdkab']);
assert.deepStrictEqual(dataset('2024').contests, ['pilpres', 'dpr', 'dpd', 'dprdprov', 'dprdkab']);
const y2019 = checkDataset('2019', dataset('2019').contests, 'P');
const y2024 = checkDataset('2024', dataset('2024').contests, '');

assert.strictEqual(y2024.contests[0].opsi.length, 3, '2024: Pilpres memiliki tiga paslon');
assert.strictEqual(y2019.contests[0].opsi.length, 2, '2019: Pilpres memiliki dua paslon');
for (const contest of y2019.contests.filter(contest => contest.id !== 'pilpres')) {
  assert.deepStrictEqual(contest.opsi.map(option => option.no), officialPartyNumbers,
    `${contest.id}: urutan partai UI harus mengikuti nomor surat suara`);
}
// Surat suara DPR RI 2024 hanya memuat 18 partai nasional: nomor 18–23 adalah
// partai lokal Aceh yang menurut undang-undang hanya ikut DPRA dan DPRK,
// sehingga kolomnya memang tidak ada pada sumber dan bukan data yang hilang.
const dpr2024 = y2024.contests.find(contest => contest.id === 'dpr');
assert.ok(dpr2024, '2024: kontes DPR RI harus terbaca dari election2024.json');
assert.deepStrictEqual(dpr2024.opsi.map(option => option.no),
  [...Array.from({ length: 17 }, (_, index) => String(index + 1)), '24'],
  'dpr 2024: urutan partai UI harus mengikuti nomor surat suara DPR RI');
assert.deepStrictEqual(dpr2024.opsi.map(option => option.column),
  dpr2024.opsi.map(option => `partai-${option.no}`),
  'dpr 2024: setiap opsi harus terpetakan ke kolom partai-<nomor urut>');
assert.ok(dpr2024.opsi.every(option => option.pendek && !/^Partai /.test(option.pendek)),
  'dpr 2024: seluruh kolom harus dikenali PARTY_SPEC_2024, bukan unknownOption()');
// Kedua surat suara DPRD memakai seluruh 24 nomor: keenam partai lokal Aceh
// tercetak pada surat suara DPRA dan DPRK, sehingga kolomnya ada di setiap
// provinsi dan bernilai nol di luar Aceh — hal itu diuji pada
// test_2024_artifacts.py, berikut kekosongan sah DKI Jakarta dan luar negeri
// pada kontes DPRD Kabupaten/Kota.
for (const [contestId, label] of [['dprdprov', 'DPRD Provinsi'], ['dprdkab', 'DPRD Kabupaten/Kota']]) {
  const contest = y2024.contests.find(item => item.id === contestId);
  assert.ok(contest, `2024: kontes ${label} harus terbaca dari election2024.json`);
  assert.deepStrictEqual(contest.opsi.map(option => option.no),
    Array.from({ length: 24 }, (_, index) => String(index + 1)),
    `${contestId} 2024: urutan partai UI harus mengikuti nomor surat suara ${label}`);
  assert.deepStrictEqual(contest.opsi.map(option => option.column),
    contest.opsi.map(option => `partai-${option.no}`),
    `${contestId} 2024: setiap opsi harus terpetakan ke kolom partai-<nomor urut>`);
  assert.ok(contest.opsi.every(option => option.pendek && !/^Partai /.test(option.pendek)),
    `${contestId} 2024: seluruh kolom harus dikenali PARTY_SPEC_2024, bukan unknownOption()`);
}
// DPD dipilih per provinsi: kolom calon-<nomor urut> hanya bermakna bersama
// roster provinsinya, jadi opsi posisi nasional tidak pernah tampil sebagai
// calon, dan luar negeri (yang tidak menerima surat suara DPD) tanpa roster.
const dpd2024 = y2024.contests.find(contest => contest.id === 'dpd');
assert.ok(dpd2024, '2024: kontes DPD harus terbaca dari election2024.json');
assert.strictEqual(dpd2024.jenis, 'calon');
assert.deepStrictEqual(dpd2024.voteColumns, Array.from({ length: 54 }, (_, index) => `calon-${index + 1}`));
assert.ok(dpd2024.opsi.every(option => option.absent), 'dpd: opsi posisi nasional tidak boleh tampil');
assert.strictEqual(dpd2024.rosters.size, 38, 'dpd: satu roster untuk tiap provinsi dalam negeri');
assert.ok(!dpd2024.rosters.has('99'), 'dpd: luar negeri tidak memilih DPD');
assert.strictEqual(app.shownIndexes(dpd2024.rosters.get('32')).length, 54, 'dpd: Jawa Barat memuat 54 calon');
assert.strictEqual(app.shownIndexes(dpd2024.rosters.get('34')).length, 9, 'dpd: DIY memuat 9 calon');
const installedDpd = app.S.contestsById.get('dpd');
const jabar = app.S.root.anak.find(node => node.code === '32');
assert.strictEqual(app.opsiFor(jabar.anak[0].anak[0], installedDpd), installedDpd.rosters.get('32'),
  'dpd: kecamatan memakai roster provinsinya');
assert.strictEqual(app.opsiFor(app.S.root, installedDpd), installedDpd.opsi,
  'dpd: tingkat nasional tidak memakai roster provinsi mana pun');
for (const [code, roster] of installedDpd.rosters) {
  const withVotes = roster.filter(option => option.rank != null).length;
  const seats = roster.filter(option => option.seat);
  assert.strictEqual(seats.length, Math.min(app.DPD_SEATS, withVotes),
    `dpd ${code}: kursi indikatif harus empat besar yang memperoleh suara`);
  assert.ok(seats.every(option => option.rank <= app.DPD_SEATS), `dpd ${code}: kursi di luar empat besar`);
}
assert.strictEqual(app.candidateShortName('Dr. H. A. MUFAKHIR MUHAMMAD, M.A.'), 'A. Mufakhir Muhammad');
assert.strictEqual(app.candidateShortName('Tgk. AHMADA'), 'Ahmada');
assert.strictEqual(app.candidateShortName('ABDUL HADI BANG JONI'), 'Abdul Hadi Bang Joni');
assert.strictEqual(app.candidateShortName("AHMAD BALIGH MU'AIDI"), "Ahmad Baligh Mu'aidi");

// Kunci 2024 adalah kode Kemendagri apa adanya, karena itulah yang membuat
// penggabungan dengan shapefile desa berjalan tanpa pencocokan nama.
const sampleVillage = [...app.S.nodes.values()].find(node => node.lv === 4 && node.key.startsWith('11.'));
assert.ok(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(sampleVillage.key),
  `2024: kunci desa harus berbentuk kode Kemendagri, ditemukan ${sampleVillage.key}`);

/* ── jalur berkas dan sisa implementasi lama ─────────────────────── */
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const forbidden of ['mulberry32', 'sharesFor', 'sintetis', 'indonesia-atlas', 'topojson.feature', 'kec_index.json']) {
  assert(!source.includes(forbidden), `jalur lama masih ditemukan: ${forbidden}`);
}
assert(source.includes('${gisDir}/${folder}/${encodeURIComponent(key)}.json'),
  'chunk GeoJSON harus dibaca dari folder dataset aktif');
assert(source.includes('${dataset.leafDir}/${encodeURIComponent(P.key)}.json'),
  'chunk hasil desa harus dibaca dari folder dataset aktif');
assert(source.includes('pemilu${S.D.id}-${S.pemilu}-'),
  'nama berkas CSV harus mengikuti tahun aktif');
assert(!source.includes('.slice(0, O.length > 8 ? 8 : O.length)'),
  'tabel harus menampilkan seluruh partai, bukan hanya delapan pertama');
for (const D of app.DATASETS) {
  for (const file of [D.hierarchy, D.election]) {
    assert.ok(fs.existsSync(path.join(root, file)), `artefak ${file} harus ada di repo`);
  }
  assert.ok(fs.existsSync(path.join(root, D.gisDir, 'provinsi.json')),
    `${D.id}: ${D.gisDir}/provinsi.json harus ada`);
  assert.ok(fs.existsSync(path.join(root, D.leafDir)), `${D.id}: folder chunk hasil harus ada`);
}

console.log('geo_mapping.test.js: skema dua tahun, rollup eksak, urutan surat suara, roster DPD, dan pemetaan key lulus');
