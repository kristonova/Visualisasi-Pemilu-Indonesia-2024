'use strict';

/* Regresi penukar tahun.
   `app.js` menulis seluruh antarmukanya lewat innerHTML, jadi bug pemuat lintas
   tahun—id elemen yang hilang, template yang menghasilkan `undefined`, bundel
   yang tertukar—hanya muncul saat kode render benar-benar dijalankan. Tes ini
   menjalankan boot() sungguhan di Node dengan DOM, d3, dan fetch yang distub:
   fetch membaca artefak dari disk, sedangkan d3 hanya perlu tidak melempar
   karena yang diperiksa di sini adalah markup dan state, bukan gambar peta. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const IDS = ['tabs', 'yearseg', 'yearnote', 'brandyear', 'modeseg', 'focussel', 'focuslab',
  'viewinfo', 'viewport', 'map', 'gridwrap', 'locator', 'loclab', 'locsvg', 'zoombtns',
  'zin', 'zout', 'zrst', 'loading', 'legend', 'panel', 'crumbs', 'tip', 'q', 'qr',
  'ttoggle', 'tcsv', 'srcnote', 'tablewrap', 'dtable'];

// Setiap id di atas harus benar-benar ada di kedua entry HTML, kalau tidak stub
// ini akan menyembunyikan elemen yang lupa ditambahkan ke halaman.
for (const file of ['index.html', 'pemilu-2024.html']) {
  const markup = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const id of IDS) {
    if (id === 'loading') continue; // dibuat ulang saat runtime
    assert.ok(markup.includes(`id="${id}"`), `${file}: elemen #${id} hilang`);
  }
}

const elements = new Map();
function makeElement(id) {
  return {
    id, _html: '', textContent: '', hidden: false, value: '',
    style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
    clientWidth: 900, clientHeight: 600,
    get innerHTML() { return this._html; },
    set innerHTML(value) {
      assert.strictEqual(typeof value, 'string', `#${id}: innerHTML bukan string`);
      assert.ok(!/undefined|\[object Object\]|NaN/.test(value),
        `#${id}: markup memuat nilai rusak → ${value.slice(0, 160)}`);
      this._html = value;
    },
    querySelectorAll() { return []; },
    appendChild(child) { return child; },
    addEventListener() {},
    remove() { elements.delete(this.id); },
    focus() {}, click() {}
  };
}
for (const id of IDS) elements.set(id, makeElement(id));

global.document = {
  querySelector: selector => (selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null),
  querySelectorAll: () => [],
  createElement: tag => makeElement(`created:${tag}`),
  title: ''
};
global.window = { innerWidth: 1400, innerHeight: 900 };
global.addEventListener = () => {};
global.location = { search: '' };

const d3chain = new Proxy(function () {}, {
  get(_target, property) {
    if (property === 'bounds') return () => [[0, 0], [10, 10]];
    if (property === 'toString') return () => '';
    if (property === Symbol.toPrimitive) return () => '';
    return () => d3chain;
  },
  apply: () => d3chain
});
const zoomIdentity = { translate: () => zoomIdentity, scale: () => zoomIdentity, toString: () => '' };
global.d3 = {
  select: () => d3chain,
  zoom: () => d3chain,
  zoomIdentity,
  geoMercator: () => d3chain,
  geoPath: () => Object.assign(() => 'M0,0', { bounds: () => [[0, 0], [10, 10]] }),
  interpolateRgb: () => () => '#808080',
  quantile: (values, q) => values[Math.floor((values.length - 1) * q)] || 0,
  ascending: (a, b) => a - b,
  max: values => Math.max(0, ...values),
  range: count => Array.from({ length: count }, (_, index) => index),
  easeCubicOut: value => value
};

const requests = [];
global.fetch = async url => {
  const file = path.join(ROOT, decodeURIComponent(url));
  requests.push(url);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
};

const app = require(path.join(ROOT, 'app.js'));
const S = app.S;
const nameChain = node => {
  const out = [];
  while (node) { out.unshift(node.name); node = node.parent; }
  return out;
};

(async () => {
  await new Promise(resolve => setTimeout(resolve, 50));

  // ── boot ──────────────────────────────────────────────────────────
  assert.strictEqual(S.tahun, app.DATASETS[0].id, 'boot harus memakai tahun default');
  assert.ok(S.root && S.nodes.size > 80000, 'pohon wilayah harus terbangun');
  assert.strictEqual(elements.get('brandyear').textContent, S.tahun);
  for (const dataset of app.DATASETS) {
    assert.ok(elements.get('yearseg').innerHTML.includes(`value="${dataset.id}"`),
      `penukar tahun harus memuat ${dataset.id}`);
  }
  assert.ok(elements.get('tabs').innerHTML.includes(`Presiden ${S.tahun}`),
    'label tab harus memuat tahun aktif');
  assert.ok(elements.get('srcnote').textContent.startsWith(`Pemilu ${S.tahun}`));
  assert.ok(elements.get('panel').innerHTML.includes('INDONESIA'));

  // ── drill-down lalu tukar tahun ───────────────────────────────────
  const province = S.root.anak.find(node => node.name === 'JAWA TENGAH');
  assert.ok(province, 'Jawa Tengah harus ada pada kedua tahun');
  const district = province.anak[0].anak[0];
  await app.select(district);
  const before = nameChain(S.sel);
  assert.strictEqual(before.length, 4, 'seleksi harus berada di tingkat kecamatan');

  const other = app.DATASETS.find(dataset => dataset.id !== S.tahun);
  await app.selectYear(other.id);
  assert.strictEqual(S.tahun, other.id, 'tahun aktif harus berpindah');
  assert.strictEqual(S.D.id, other.id, 'dataset aktif harus ikut berpindah');
  assert.deepStrictEqual(nameChain(S.sel), before,
    'wilayah yang sama harus ditemukan kembali lewat rantai nama');
  assert.strictEqual(elements.get('brandyear').textContent, other.id);
  assert.ok(elements.get('tabs').innerHTML.includes(`Presiden ${other.id}`));
  assert.ok(elements.get('srcnote').textContent.startsWith(`Pemilu ${other.id}`));
  assert.strictEqual(S.fokus, 0, 'opsi fokus harus direset karena daftar opsi berbeda');
  assert.strictEqual(S.mapViewKey !== null, true, 'peta harus tergambar ulang setelah tukar tahun');

  // Jumlah opsi memang berbeda antartahun; itulah alasan fokus dan urutan
  // tabel direset, dan alasan bundel tidak boleh saling pakai.
  const optionCounts = new Map();
  for (const dataset of app.DATASETS) optionCounts.set(dataset.id, dataset.paslon.length);
  assert.strictEqual(S.contestsById.get('pilpres').opsi.length, optionCounts.get(other.id));

  // ── kembali: bundel pertama harus dari cache ──────────────────────
  const requestsBefore = requests.length;
  const first = app.DATASETS.find(dataset => dataset.id !== S.tahun);
  await app.selectYear(first.id);
  assert.strictEqual(S.tahun, first.id);
  assert.strictEqual(requests.length, requestsBefore,
    'kembali ke tahun yang sudah dimuat tidak boleh memicu permintaan jaringan');
  assert.deepStrictEqual(nameChain(S.sel), before);
  assert.strictEqual(S.contestsById.get('pilpres').opsi.length, optionCounts.get(first.id));

  // ── DPD: roster berganti per provinsi ─────────────────────────────
  // Stub innerHTML di atas sudah menolak markup berisi undefined/NaN, jadi
  // setiap render di bawah sekaligus memeriksa jalur roster dan nasional.
  assert.strictEqual(S.tahun, '2024');
  assert.ok(elements.get('tabs').innerHTML.includes('DPD RI 2024'), 'tab DPD harus tampil pada 2024');
  const pemiluBefore = S.pemilu, modeBefore = S.mode;
  S.pemilu = 'dpd';
  for (const mode of ['winner', 'margin', 'share', 'turnout']) {
    S.mode = mode;
    await app.select(S.root);
  }
  S.mode = 'winner';
  await app.select(S.root);
  assert.ok(elements.get('panel').innerHTML.includes('DPD dipilih per provinsi'),
    'nasional DPD tidak boleh mengklaim pemenang nasional');
  assert.ok(elements.get('panel').innerHTML.includes('10 calon se-Indonesia'));
  assert.ok(elements.get('legend').innerHTML.includes('Porsi suara calon teratas'));
  assert.ok(elements.get('dtable').innerHTML.includes('Calon teratas'));
  assert.ok(!/Calon \d+</.test(elements.get('dtable').innerHTML), 'kolom posisi nasional tidak boleh tampil');

  const jabar = S.root.anak.find(node => node.code === '32');
  for (const mode of ['winner', 'margin', 'share', 'turnout']) {
    S.mode = mode;
    await app.select(jabar);
  }
  S.mode = 'share';
  await app.select(jabar);
  assert.strictEqual((elements.get('focussel').innerHTML.match(/<option/g) || []).length, 54,
    'Jawa Barat: pilihan fokus memuat 54 calon');
  S.mode = 'winner';
  await app.select(jabar);
  assert.strictEqual((elements.get('panel').innerHTML.match(/class="seat"/g) || []).length, app.DPD_SEATS,
    'Jawa Barat: tepat empat lencana kursi indikatif di panel provinsi');
  const jabarKab = jabar.anak[0];
  await app.select(jabarKab);
  await app.select(jabarKab.anak[0]);
  await app.select(jabarKab.anak[0].anak[0]);
  assert.strictEqual(S.sel.lv, 4, 'drill-down DPD harus sampai tingkat desa');

  // Fokus nomor 41 tidak tercetak di DIY (9 calon) dan harus pindah.
  const diy = S.root.anak.find(node => node.code === '34');
  S.mode = 'share';
  S.fokus = 40;
  await app.select(diy);
  assert.ok(S.fokus < 9, 'fokus harus pindah ke calon yang tercetak di provinsi aktif');
  S.mode = 'winner';
  const overseasDpd = S.root.anak.find(node => node.code === '99');
  if (overseasDpd) {
    await app.select(overseasDpd);
    assert.ok(elements.get('legend').innerHTML.includes('tidak dibagikan'),
      'luar negeri tidak menerima surat suara DPD');
  }

  await app.select(jabar);
  await app.selectYear('2019');
  assert.ok(!elements.get('tabs').innerHTML.includes('DPD'), '2019 tidak punya tab DPD');
  assert.ok(elements.get('yearnote').textContent.includes('DPD RI tidak tersedia'));
  await app.selectYear('2024');
  S.pemilu = pemiluBefore;
  S.mode = modeBefore;

  // ── wilayah tanpa geometri jatuh ke grid ──────────────────────────
  const overseas = S.root.anak.find(node => node.name.includes('LUAR NEGERI'));
  if (overseas) {
    await app.select(overseas);
    assert.strictEqual(S.hasGeoView, false, 'Luar Negeri tidak punya poligon');
    assert.ok(elements.get('viewinfo').textContent.startsWith('Grid wilayah'));
    assert.ok(elements.get('gridwrap').innerHTML.includes('Kabupaten/Kota di'),
      'grid wilayah harus menampilkan anak wilayah');
    assert.strictEqual(elements.get('locator').hidden, true,
      'locator harus disembunyikan saat provinsi tidak punya geometri');
  }

  // ── tahun yang diminta lewat query string ─────────────────────────
  assert.ok(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').includes("get('tahun')"),
    'entry HTML harus dapat memilih tahun lewat parameter ?tahun=');

  console.log('year_switch.test.js: boot, drill-down, tukar tahun dua arah, cache bundel, ' +
    'dan fallback grid lulus');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
