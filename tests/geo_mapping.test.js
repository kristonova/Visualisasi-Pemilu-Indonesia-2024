'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app.js');

const wilayah = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'wilayah.json'), 'utf8'));
const election = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'election2019.json'), 'utf8'));

assert.strictEqual(wilayah.schema, 2, 'wilayah.json harus memakai schema 2');
assert.strictEqual(election.schema, 2, 'election2019.json harus memakai schema 2');
assert.deepStrictEqual(wilayah.contests, app.CONTEST_ORDER, 'wilayah memuat tepat empat kontes nyata');
assert.deepStrictEqual(election.contests.map(contest => contest.id), app.CONTEST_ORDER,
  'hasil memuat tepat empat kontes nyata dan tanpa DPD');
assert.deepStrictEqual(election.stats, [
  'total-pemilih', 'total-pengguna', 'suara-total', 'suara-sah',
  'suara-tidak-sah', 'tps', 'validated-tps', 'blank-tps', 'outlier-vote-tps'
]);

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

app.S.root = app.buildTree(wilayah);
app.installElectionData(election);
const contests = app.normalizeContests(election.contests);
assert.deepStrictEqual(contests.map(contest => contest.id), app.CONTEST_ORDER);
for (const contest of contests.filter(contest => contest.id !== 'pilpres')) {
  assert.deepStrictEqual(contest.opsi.map(option => option.no), officialPartyNumbers,
    `${contest.id}: urutan partai UI harus mengikuti nomor surat suara`);
}

const firstProvince = app.S.root.anak[0];
const firstKab = firstProvince.anak[0];
const firstKec = firstKab.anak[0];
assert.strictEqual(firstProvince.key, `P${wilayah.prov[0].k}`);
assert.strictEqual(firstKab.key, `${firstProvince.key}.${wilayah.prov[0].kab[0].k}`);
assert.strictEqual(firstKec.key, `${firstKab.key}.${wilayah.prov[0].kab[0].kec[0].k}`);
if (firstKec.anak.length) {
  assert.strictEqual(firstKec.anak[0].key,
    `${firstKec.key}.${wilayah.prov[0].kab[0].kec[0].kel[0].k}`);
}

const kecNodes = [...app.S.nodes.values()].filter(node => node.lv === 3);
assert.strictEqual(kecNodes.length, Object.keys(election.kec).length,
  'setiap kecamatan hierarki harus memiliki slot pada indeks hasil');

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
  assert.deepStrictEqual(rootResult.votes, expectedVotes, `${contest.id}: rollup suara nasional salah`);
  assert.deepStrictEqual(rootResult.stats, expectedStats, `${contest.id}: rollup statistik nasional salah`);
  assert.strictEqual(rootResult.covered, covered, `${contest.id}: cakupan kecamatan salah`);
  assert.strictEqual(rootResult.total, kecNodes.length, `${contest.id}: denominator cakupan salah`);
}

// Data nol/hilang tidak boleh menghasilkan pemenang semu.
const missing = { lv: 4, key: 'TEST.MISSING', name: 'TANPA DATA', anak: [], parent: firstKec };
assert.strictEqual(app.winnerOf(missing), null);
const contestMap = app.S.results.get(app.S.pemilu);
const tied = { lv: 4, key: 'TEST.TIED', name: 'SERI', anak: [], parent: firstKec };
contestMap.set(tied.key, {
  votes: [17, 17], stats: new Array(election.stats.length).fill(0),
  present: true, covered: 1, total: 1
});
assert.deepStrictEqual(app.leadersOf(tied), [0, 1]);
assert.strictEqual(app.winnerOf(tied), null, 'seri tidak boleh diberikan kepada opsi pertama');
assert.strictEqual(app.isTie(tied), true);
const featureA = { properties: { key: firstKec.key } };
const featureB = { properties: { key: firstKec.key } };
assert.strictEqual(app.featureNode(featureA), firstKec, 'fitur harus ditautkan lewat properties.key');
assert.strictEqual(app.featureNode(featureB), firstKec, 'multipart boleh berbagi key yang sama');
assert.strictEqual(app.featureNode({ properties: { name: firstKec.name } }), null,
  'nama mirip tidak boleh dipakai sebagai resolver GIS');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
for (const forbidden of ['mulberry32', 'sharesFor', 'sintetis', 'indonesia-atlas', 'topojson.feature', 'kec_index.json']) {
  assert(!source.includes(forbidden), `jalur lama masih ditemukan: ${forbidden}`);
}
assert(source.includes('data/gis/provinsi.json'));
assert(source.includes('data/election2019/${encodeURIComponent(P.key)}.json'));
assert(source.includes('pemilu2019-${S.pemilu}-'));
assert(!source.includes('.slice(0, O.length > 8 ? 8 : O.length)'),
  'tabel harus menampilkan seluruh 20 partai, bukan hanya delapan pertama');

console.log('geo_mapping.test.js: skema, rollup eksak, urutan partai, dan pemetaan key lulus');
