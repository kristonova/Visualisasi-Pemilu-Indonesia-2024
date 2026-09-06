/* Peta hasil Pemilu Indonesia, 2019 dan 2024.
   Hierarki, perolehan suara, statistik TPS, dan geometri dibaca dari artefak lokal.
   Setiap tahun adalah dataset yang berdiri sendiri: pohon wilayah, hasil, dan
   GeoJSON-nya terpisah karena batas serta kode desa 2019 dan 2024 berbeda, dan
   Papua dimekarkan menjadi enam provinsi setelah 2019. Karena itu peralihan tahun
   memuat ulang seluruh berkas, bukan sekadar mengganti angka di atas peta yang
   sama. Geometri bukan klaim snapshot murni pada tanggal pemungutan suara. */
'use strict';

const $ = selector => document.querySelector(selector);
const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const fmt = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : Math.round(Number(value)).toLocaleString('id-ID');
const pct = (value, digits = 1) => value == null || !Number.isFinite(Number(value))
  ? '—'
  : (Number(value) * 100).toFixed(digits).replace('.', ',') + '%';
const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* OKLCH → hex; d3-color pada versi yang dipakai halaman belum membaca OKLCH. */
function OKL(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b2 = C * Math.sin(h);
  const l_ = L + .3963377774 * a + .2158037573 * b2;
  const m_ = L - .1055613458 * a - .0638541728 * b2;
  const s_ = L - .0894841775 * a - 1.2914855480 * b2;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s;
  const bb = -.0041960863 * l - .7034186147 * m + 1.7076147010 * s;
  const channel = x => {
    x = x <= .0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - .055;
    return Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  };
  return '#' + channel(r) + channel(g) + channel(bb);
}

/* Warna paslon sengaja konsisten lintas tahun: biru tetap milik tiket Prabowo
   dan merah tetap milik tiket yang diusung PDI-P, sehingga pembaca yang sudah
   membaca peta 2019 tidak perlu belajar ulang saat menekan tombol 2024. */
const PASLON_2019 = [
  { column: 'pemilih-1', no: '01', pendek: 'Jokowi–Ma\'ruf', nama: 'Ir. H. Joko Widodo – Prof. Dr. (H.C.) K.H. Ma\'ruf Amin', warna: '#e02424' },
  { column: 'pemilih-2', no: '02', pendek: 'Prabowo–Sandi', nama: 'H. Prabowo Subianto – Sandiaga Salahuddin Uno', warna: '#1d70b8' }
];
const PASLON_2024 = [
  { column: 'paslon-1', no: '01', pendek: 'Anies–Muhaimin', nama: 'H. Anies Rasyid Baswedan, Ph.D. – Dr. (H.C.) H. A. Muhaimin Iskandar', warna: '#0f7f5c' },
  { column: 'paslon-2', no: '02', pendek: 'Prabowo–Gibran', nama: 'H. Prabowo Subianto – Gibran Rakabuming Raka', warna: '#1d70b8' },
  { column: 'paslon-3', no: '03', pendek: 'Ganjar–Mahfud', nama: 'H. Ganjar Pranowo, S.H., M.I.P. – Prof. Dr. H. M. Mahfud MD', warna: '#e02424' }
];

/* Nomor partai mengikuti surat suara: 1–14, partai lokal Aceh 15–18,
   lalu PBB 19 dan PKPI 20. `column` mengikuti tajuk CSV sumber. */
const PARTY_SPEC = [
  ['pkb', '1', 'PKB', 'Partai Kebangkitan Bangsa', 155],
  ['gerinda', '2', 'Gerindra', 'Partai Gerindra', 60],
  ['pdip', '3', 'PDI-P', 'PDI Perjuangan', 25],
  ['golkar', '4', 'Golkar', 'Partai Golkar', 90],
  ['nasdem', '5', 'NasDem', 'Partai NasDem', 245],
  ['garuda', '6', 'Garuda', 'Partai Garuda', 265],
  ['berkarya', '7', 'Berkarya', 'Partai Berkarya', 215],
  ['pks', '8', 'PKS', 'Partai Keadilan Sejahtera', 130],
  ['perindo', '9', 'Perindo', 'Partai Perindo', 45],
  ['ppp', '10', 'PPP', 'Partai Persatuan Pembangunan', 330],
  ['psi', '11', 'PSI', 'Partai Solidaritas Indonesia', 8],
  ['pan', '12', 'PAN', 'Partai Amanat Nasional', 195],
  ['hanura', '13', 'Hanura', 'Partai Hanura', 305],
  ['demokrat', '14', 'Demokrat', 'Partai Demokrat', 275],
  ['pa', '15', 'PA', 'Partai Aceh', 10],
  ['sira', '16', 'SIRA', 'Partai SIRA', 20],
  ['pda', '17', 'PDA', 'Partai Daerah Aceh', 30],
  ['pna', '18', 'PNA', 'Partai Nanggroe Aceh', 40],
  ['pbb', '19', 'PBB', 'Partai Bulan Bintang', 350],
  ['pkpi', '20', 'PKPI', 'Partai Keadilan dan Persatuan Indonesia', 110]
].map(([column, no, pendek, nama, hue], index) => ({
  column, no, pendek, nama, index,
  warna: index < 14 ? OKL(.585, .175, hue) : OKL(.665, .105, hue)
}));

/* Surat suara 2024: 1–17 partai nasional, 18–23 partai lokal Aceh, lalu Ummat
   di nomor 24. Kolom `partai-<nomor urut>` adalah kontrak yang dipakai builder
   legislatif 2024, sama seperti `paslon-<nomor urut>` pada Pilpres 2024; kolom
   yang tidak dikenali tetap tampil lewat unknownOption(). Daftar ini memuat
   seluruh 24 partai karena dipakai bersama oleh setiap kontes legislatif;
   surat suara DPR RI sendiri hanya membawa 18 partai nasional (1–17 dan 24)
   sebab partai lokal Aceh secara undang-undang hanya ikut DPRA dan DPRK.
   Surat suara DPRD Provinsi memuat 24 nomor, tetapi keenam partai lokal itu
   hanya tercetak di Aceh sehingga kolomnya nol di provinsi lain. */
const PARTY_SPEC_2024 = [
  ['1', 'PKB', 'Partai Kebangkitan Bangsa', 155],
  ['2', 'Gerindra', 'Partai Gerakan Indonesia Raya', 60],
  ['3', 'PDI-P', 'PDI Perjuangan', 25],
  ['4', 'Golkar', 'Partai Golkar', 90],
  ['5', 'NasDem', 'Partai NasDem', 245],
  ['6', 'Buruh', 'Partai Buruh', 40],
  ['7', 'Gelora', 'Partai Gelombang Rakyat Indonesia', 225],
  ['8', 'PKS', 'Partai Keadilan Sejahtera', 130],
  ['9', 'PKN', 'Partai Kebangkitan Nusantara', 15],
  ['10', 'Hanura', 'Partai Hati Nurani Rakyat', 75],
  ['11', 'Garuda', 'Partai Garda Republik Indonesia', 265],
  ['12', 'PAN', 'Partai Amanat Nasional', 195],
  ['13', 'PBB', 'Partai Bulan Bintang', 350],
  ['14', 'Demokrat', 'Partai Demokrat', 275],
  ['15', 'PSI', 'Partai Solidaritas Indonesia', 8],
  ['16', 'Perindo', 'Partai Perindo', 290],
  ['17', 'PPP', 'Partai Persatuan Pembangunan', 330],
  ['18', 'PNA', 'Partai Nanggroe Aceh', 45],
  ['19', 'Gabthat', 'Partai Generasi Atjeh Beusaboh Tha\'at Dan Taqwa', 105],
  ['20', 'PDA', 'Partai Darul Aceh', 200],
  ['21', 'PA', 'Partai Aceh', 20],
  ['22', 'PAS Aceh', 'Partai Adil Sejahtera Aceh', 145],
  ['23', 'SIRA', 'Partai SIRA', 240],
  ['24', 'Ummat', 'Partai Ummat', 310]
].map(([no, pendek, nama, hue], index) => ({
  column: `partai-${no}`, no, pendek, nama, index,
  warna: index < 17 ? OKL(.585, .175, hue) : OKL(.665, .105, hue)
}));

const partyIndex = spec => new Map(spec.map(party => [columnKey(party.column), party]));
const CONTEST_ORDER = ['pilpres', 'dpr', 'dprdprov', 'dprdkab'];
const CONTEST_NAMES = {
  pilpres: ['Pemilu Presiden', 'Presiden'],
  dpr: ['Pemilihan Legislatif', 'DPR RI'],
  dprdprov: ['Pemilihan Legislatif', 'DPRD Provinsi'],
  dprdkab: ['Pemilihan Legislatif', 'DPRD Kab/Kota']
};

/* Satu entri per tahun pemilu. `keyPrefix` mengikuti berkas hierarki: token KPU
   2019 memakai awalan "P", sedangkan kunci 2024 adalah kode Kemendagri apa
   adanya (11.01.01.2015) sehingga sama persis dengan KDEPUM pada shapefile. */
const DATASETS = [
  {
    id: '2024',
    hierarchy: 'data/wilayah2024.json',
    election: 'data/election2024.json',
    leafDir: 'data/election2024',
    gisDir: 'data/gis2024',
    paslon: PASLON_2024,
    parties: PARTY_SPEC_2024,
    // Urutannya wajib sama dengan slot pada election2024.json.
    contests: CONTEST_ORDER,
    geoNote: 'batas desa Kemendagri edisi Juli 2026',
    sourceNote: 'scrape KPU Sirekap 2024'
  },
  {
    id: '2019',
    hierarchy: 'data/wilayah.json',
    election: 'data/election2019.json',
    leafDir: 'data/election2019',
    gisDir: 'data/gis',
    paslon: PASLON_2019,
    parties: PARTY_SPEC,
    contests: CONTEST_ORDER,
    geoNote: 'batas diselaraskan ke hierarki 2019',
    sourceNote: 'CSV KPU 2019'
  }
];
const DEFAULT_YEAR = DATASETS[0].id;
const PARTY_BY_COLUMN = partyIndex(PARTY_SPEC);
const LEVELS = ['Nasional', 'Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Kelurahan/Desa'];
const ANAK = ['Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Kelurahan/Desa', ''];
const BGT = '#f3f2f2';
const NO_DATA = '#d4d1cf';
const TIE_COLOR = '#8b8581';

let PEMILU = [];
const S = {
  D: null, tahun: null, bundles: new Map(), active: null,
  pemilu: null, mode: 'margin', fokus: 0, sel: null, root: null,
  nodes: new Map(), index: [], results: new Map(), contestsById: new Map(),
  statNames: [], statIndex: new Map(), election: null, sourceSummary: null,
  geoProv: null, geoKab: new Map(), geoKec: new Map(), geoDesa: new Map(),
  leafLoads: new Map(), leafErrors: new Map(), sort: { k: 'v', d: -1 },
  mapViewKey: null, mapViewNodeKey: null, mapCollection: null, hasGeoView: false
};

/* Bidang S yang milik satu tahun saja. Peralihan tahun menyimpan bidang ini ke
   bundel tahun yang ditinggalkan lalu memuat bundel tahun tujuan, sehingga sisa
   kode tetap membaca S seperti biasa dan pohon yang sudah dimuat tidak perlu
   diambil ulang dari jaringan. */
const BUNDLE_FIELDS = ['D', 'pemilu', 'sel', 'root', 'nodes', 'index', 'results',
  'contestsById', 'statNames', 'statIndex', 'election', 'sourceSummary',
  'geoProv', 'geoKab', 'geoKec', 'geoDesa', 'leafLoads', 'leafErrors'];

function blankBundle(D) {
  return {
    D, pemilu: null, sel: null, root: null, nodes: new Map(), index: [],
    results: new Map(), contestsById: new Map(), statNames: [], statIndex: new Map(),
    election: null, sourceSummary: null, geoProv: null, geoKab: new Map(),
    geoKec: new Map(), geoDesa: new Map(), leafLoads: new Map(), leafErrors: new Map(),
    PEMILU: []
  };
}
function saveBundle(bundle) {
  if (!bundle) return;
  for (const field of BUNDLE_FIELDS) bundle[field] = S[field];
  bundle.PEMILU = PEMILU;
}
function restoreBundle(bundle) {
  for (const field of BUNDLE_FIELDS) S[field] = bundle[field];
  PEMILU = bundle.PEMILU;
  S.active = bundle;
  S.tahun = bundle.D.id;
}
function datasetById(id) { return DATASETS.find(dataset => dataset.id === id) || DATASETS[0]; }

function columnKey(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return key === 'gerindra' ? 'gerinda' : key;
}

function unknownOption(column, index) {
  const label = String(column || `opsi-${index + 1}`).replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return { column, no: String(index + 1), pendek: label, nama: label, warna: OKL(.62, .12, (index * 67) % 360) };
}

function normalizeContests(rawContests, dataset = DATASETS[DATASETS.length - 1]) {
  const paslonSpec = dataset.paslon || PASLON_2019;
  const partySpec = dataset.parties || PARTY_SPEC;
  const partyByColumn = partyIndex(partySpec);
  const rows = Array.isArray(rawContests) ? rawContests : [];
  const byId = new Map(rows.map((contest, sourceIndex) => [contest.id, { ...contest, sourceIndex }]));
  return CONTEST_ORDER.map(id => {
    const source = byId.get(id);
    if (!source) return null;
    let columns = Array.isArray(source.vote_columns) ? source.vote_columns.slice() : [];
    let ordered;
    if (id === 'pilpres') {
      if (!columns.length) columns = paslonSpec.map(o => o.column);
      ordered = columns.map((column, sourceIndex) => ({ column, sourceIndex }))
        .sort((a, b) => {
          const ai = paslonSpec.findIndex(o => columnKey(o.column) === columnKey(a.column));
          const bi = paslonSpec.findIndex(o => columnKey(o.column) === columnKey(b.column));
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.sourceIndex - b.sourceIndex;
        });
    } else {
      if (!columns.length) columns = partySpec.map(o => o.column);
      ordered = columns.map((column, sourceIndex) => ({ column, sourceIndex }))
        .sort((a, b) => {
          const ap = partyByColumn.get(columnKey(a.column));
          const bp = partyByColumn.get(columnKey(b.column));
          return (ap ? ap.index : 999) - (bp ? bp.index : 999) || a.sourceIndex - b.sourceIndex;
        });
    }
    const opsi = ordered.map(({ column }, index) => {
      if (id === 'pilpres') {
        const option = paslonSpec.find(o => columnKey(o.column) === columnKey(column));
        return option ? { ...option } : unknownOption(column, index);
      }
      const option = partyByColumn.get(columnKey(column));
      return option ? { ...option } : unknownOption(column, index);
    });
    const [kicker, nama] = CONTEST_NAMES[id];
    return {
      id, kicker: `${kicker} ${dataset.id}`, nama: `${nama} ${dataset.id}`, opsi,
      jenis: id === 'pilpres' ? 'paslon' : 'partai',
      sourceIndex: source.sourceIndex,
      sourceIndexes: ordered.map(row => row.sourceIndex),
      voteColumns: ordered.map(row => row.column)
    };
  }).filter(Boolean);
}

/* ── pohon wilayah dan hasil eksak ───────────────────────────────── */
function buildTree(raw) {
  S.nodes = new Map();
  // 2019 memakai token KPU berawalan "P"; 2024 memakai kode Kemendagri tanpa
  // awalan sehingga kunci simpul sama persis dengan KDEPUM pada shapefile.
  const prefix = typeof raw.key_prefix === 'string' ? raw.key_prefix : 'P';
  const root = { lv: 0, key: 'ID', name: 'INDONESIA', code: '0', anak: [], parent: null };
  for (const p of raw.prov || []) {
    const P = { lv: 1, key: prefix + p.k, name: String(p.n || '').replace(/^\+\s*/, '').toUpperCase(), code: String(p.k), anak: [], parent: root };
    for (const k of p.kab || []) {
      const K = { lv: 2, key: `${P.key}.${k.k}`, name: String(k.n || '').toUpperCase(), code: String(k.k), anak: [], parent: P };
      for (const c of k.kec || []) {
        const C = { lv: 3, key: `${K.key}.${c.k}`, name: String(c.n || '').toUpperCase(), code: String(c.k), anak: [], parent: K };
        for (const l of c.kel || []) {
          C.anak.push({
            lv: 4, key: `${C.key}.${l.k}`, name: String(l.n || '').toUpperCase(),
            code: String(l.k), anak: [], parent: C
          });
        }
        K.anak.push(C);
      }
      P.anak.push(K);
    }
    root.anak.push(P);
  }
  const walk = node => {
    if (S.nodes.has(node.key)) throw new Error(`Kode wilayah ganda: ${node.key}`);
    S.nodes.set(node.key, node);
    node.anak.forEach(walk);
  };
  walk(root);
  return root;
}

function emptyResult(E, total = 1) {
  return {
    votes: new Array(E.opsi.length).fill(0), stats: new Array(S.statNames.length).fill(0),
    present: false, covered: 0, total
  };
}

function parseEntry(entry, E) {
  if (!Array.isArray(entry) || !Array.isArray(entry[0])) return emptyResult(E);
  const sourceVotes = entry[0];
  const sourceStats = Array.isArray(entry[1]) ? entry[1] : [];
  return {
    votes: E.sourceIndexes.map(index => number(sourceVotes[index])),
    stats: S.statNames.map((_, index) => number(sourceStats[index])),
    present: true, covered: 1, total: 1
  };
}

function combineResults(results, E) {
  const out = emptyResult(E, 0);
  for (const result of results) {
    if (!result) continue;
    out.covered += result.covered;
    out.total += result.total;
    if (!result.present) continue;
    out.present = true;
    result.votes.forEach((value, index) => { out.votes[index] += number(value); });
    result.stats.forEach((value, index) => { out.stats[index] += number(value); });
  }
  return out;
}

function installElectionData(data, dataset = DATASETS[DATASETS.length - 1]) {
  S.election = data;
  S.sourceSummary = data.source_summary || null;
  S.statNames = Array.isArray(data.stats) ? data.stats.slice() : [];
  S.statIndex = new Map(S.statNames.map((name, index) => [name, index]));
  PEMILU = normalizeContests(data.contests, dataset);
  const expected = (dataset.contests || CONTEST_ORDER).length;
  if (PEMILU.length !== expected) {
    console.warn(`Diharapkan ${expected} kontes ${dataset.id}, ditemukan ${PEMILU.length}.`);
  }
  S.contestsById = new Map(PEMILU.map(contest => [contest.id, contest]));
  S.results = new Map(PEMILU.map(contest => [contest.id, new Map()]));

  const kecData = data.kec || {};
  for (const E of PEMILU) {
    const map = S.results.get(E.id);
    for (const node of S.nodes.values()) {
      if (node.lv !== 3) continue;
      const row = kecData[node.key];
      map.set(node.key, parseEntry(Array.isArray(row) ? row[E.sourceIndex] : null, E));
    }
    const roll = node => {
      if (node.lv === 3) return map.get(node.key) || emptyResult(E);
      const result = combineResults(node.anak.map(roll), E);
      map.set(node.key, result);
      return result;
    };
    roll(S.root);
  }
  S.pemilu = PEMILU[0] ? PEMILU[0].id : null;
}

function provinceOf(node) { while (node && node.lv > 1) node = node.parent; return node && node.lv === 1 ? node : null; }
function ancestorAt(node, level) { while (node && node.lv > level) node = node.parent; return node && node.lv === level ? node : null; }
function resultOf(node, contestId = S.pemilu) {
  const E = S.contestsById.get(contestId);
  const map = S.results.get(contestId);
  return E && map && map.get(node.key) ? map.get(node.key) : (E ? emptyResult(E) : null);
}
function votesOf(node) { const result = resultOf(node); return result ? result.votes : []; }
function sahOf(node) { const result = resultOf(node); return result && result.present ? result.votes.reduce((a, b) => a + b, 0) : null; }
function statOf(nodeOrResult, name) {
  const result = nodeOrResult && nodeOrResult.votes ? nodeOrResult : resultOf(nodeOrResult);
  const index = S.statIndex.get(name);
  return result && result.present && index != null ? number(result.stats[index]) : null;
}

async function loadLeafResults(P) {
  if (!P) return;
  if (S.leafLoads.has(P.key)) return S.leafLoads.get(P.key);
  // Peta dan daftar kontes dipegang di sini supaya chunk yang selesai setelah
  // pengguna berpindah tahun tetap ditulis ke bundel asalnya.
  const dataset = S.D, results = S.results, contests = PEMILU, errors = S.leafErrors;
  const promise = (async () => {
    let chunk = null;
    try {
      const response = await fetch(`${dataset.leafDir}/${encodeURIComponent(P.key)}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      chunk = await response.json();
      if (chunk.schema !== 2 || !chunk.leaf) throw new Error('skema chunk hasil desa tidak didukung');
    } catch (error) {
      errors.set(P.key, error.message);
      console.warn(`Hasil desa ${P.key} gagal dimuat`, error);
      chunk = { leaf: {} };
    }
    for (const K of P.anak) for (const C of K.anak) for (const L of C.anak) {
      const row = chunk.leaf[L.key];
      for (const E of contests) {
        results.get(E.id).set(L.key, parseEntry(Array.isArray(row) ? row[E.sourceIndex] : null, E));
      }
    }
  })();
  S.leafLoads.set(P.key, promise);
  return promise;
}

/* ── warna dan skala ─────────────────────────────────────────────── */
function election() { return S.contestsById.get(S.pemilu); }
function opsi() { const E = election(); return E ? E.opsi : []; }
function leadersOf(node) {
  const result = resultOf(node), votes = result ? result.votes : [];
  const total = result && result.present ? votes.reduce((a, b) => a + b, 0) : 0;
  if (total <= 0 || !votes.length) return [];
  const maximum = Math.max(...votes);
  return votes.map((value, index) => value === maximum ? index : -1).filter(index => index >= 0);
}
function winnerOf(node) { const leaders = leadersOf(node); return leaders.length === 1 ? leaders[0] : null; }
function isTie(node) { return leadersOf(node).length > 1; }
function marginOf(node) {
  const result = resultOf(node);
  if (!result || !result.present) return null;
  const votes = result.votes.slice().sort((a, b) => b - a);
  const total = votes.reduce((a, b) => a + b, 0);
  return total > 0 ? (votes[0] - (votes[1] || 0)) / total : null;
}
function turnoutOf(node) {
  const result = resultOf(node);
  const validated = statOf(result, 'validated-tps');
  const registered = statOf(result, 'total-pemilih');
  const users = statOf(result, 'total-pengguna');
  return result && result.present && validated > 0 && registered > 0 ? users / registered : null;
}
function activeUnits() {
  if (!S.sel) return [];
  return S.sel.anak.length ? S.sel.anak : [S.sel];
}
function updateScale() {
  const units = activeUnits();
  const turnouts = units.map(turnoutOf).filter(value => value != null && value >= 0);
  S.tDom = turnouts.length
    ? [d3.quantile(turnouts.slice().sort(d3.ascending), .02), d3.quantile(turnouts.slice().sort(d3.ascending), .98)]
    : [.55, .9];
  if (S.tDom[1] - S.tDom[0] < .02) S.tDom = [Math.max(0, S.tDom[0] - .01), S.tDom[1] + .01];
  const shares = units.map(node => {
    const total = sahOf(node), votes = votesOf(node);
    return total > 0 ? votes[S.fokus] / total : null;
  }).filter(value => value != null);
  S.sDom = [0, Math.max(.08, d3.max(shares) || .5)];
}
function colorOf(node) {
  const O = opsi();
  if (S.mode === 'turnout') {
    const turnout = turnoutOf(node);
    if (turnout == null) return NO_DATA;
    const [a, b] = S.tDom || [.55, .9];
    return d3.interpolateRgb('#f6f4f3', '#201e1d')(Math.min(1, Math.max(0, (turnout - a) / (b - a))));
  }
  const total = sahOf(node);
  if (!(total > 0)) return NO_DATA;
  if (S.mode === 'share') {
    const max = (S.sDom || [0, .75])[1];
    return d3.interpolateRgb(BGT, O[S.fokus].warna)(Math.min(1, (votesOf(node)[S.fokus] / total) / max));
  }
  const winner = winnerOf(node);
  if (winner == null) return isTie(node) ? TIE_COLOR : NO_DATA;
  const color = O[winner].warna;
  if (S.mode === 'winner') return color;
  return d3.interpolateRgb(d3.interpolateRgb(BGT, color)(.22), color)(Math.min(1, marginOf(node) / .5));
}

/* ── kontrol tahun, kontes, dan legenda ──────────────────────────── */
function renderYears() {
  const seg = $('#yearseg');
  if (!seg) return;
  seg.innerHTML = DATASETS.map(dataset =>
    `<label class="seg-opt"><input type="radio" name="tahun" value="${esc(dataset.id)}"
      ${dataset.id === S.tahun ? 'checked' : ''}>${esc(dataset.id)}</label>`).join('');
  seg.querySelectorAll('input').forEach(input => {
    input.onchange = () => { if (input.checked) selectYear(input.value); };
  });
  const brand = $('#brandyear');
  if (brand) brand.textContent = S.tahun || '';
  const missing = PEMILU.length < CONTEST_ORDER.length
    ? ` · ${CONTEST_ORDER.length - PEMILU.length} kontes legislatif belum tersedia`
    : '';
  const kicker = $('#yearnote');
  if (kicker) kicker.textContent = `${PEMILU.length} kontes${missing}`;
}
function renderTabs() {
  $('#tabs').innerHTML = PEMILU.map(E =>
    `<button class="tab" role="tab" data-e="${E.id}" aria-selected="${E.id === S.pemilu}">
      <span class="tk">${esc(E.kicker)}</span><span class="tn">${esc(E.nama)}</span></button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(button => {
    button.onclick = () => {
      S.pemilu = button.dataset.e;
      S.fokus = Math.min(S.fokus, Math.max(0, opsi().length - 1));
      if (typeof S.sort.k === 'number' && S.sort.k >= opsi().length) {
        S.sort = { k: 'v', d: -1 };
      }
      showAll = false;
      renderTabs();
      renderAll();
    };
  });
}
function renderModes() {
  const modes = [['winner', 'Pemenang'], ['margin', 'Margin'], ['share', 'Perolehan'], ['turnout', 'Partisipasi']];
  $('#modeseg').innerHTML = modes.map(([key, label]) =>
    `<label class="seg-opt"><input type="radio" name="m" value="${key}" ${key === S.mode ? 'checked' : ''}>${label}</label>`).join('');
  $('#modeseg').querySelectorAll('input').forEach(input => {
    input.onchange = () => { S.mode = input.value; renderModes(); renderAll(); };
  });
  const isShare = S.mode === 'share';
  $('#focussel').hidden = !isShare;
  $('#focuslab').hidden = !isShare;
  if (isShare) {
    $('#focussel').innerHTML = opsi().map((option, index) =>
      `<option value="${index}" ${index === S.fokus ? 'selected' : ''}>${esc(option.no)}. ${esc(option.pendek)}</option>`).join('');
    $('#focussel').onchange = event => { S.fokus = +event.target.value; renderAll(); };
  }
}
function renderLegend() {
  const O = opsi(), legend = $('#legend'), level = ANAK[S.sel.lv] || LEVELS[S.sel.lv];
  if (S.mode === 'turnout') {
    const [a, b] = S.tDom || [.55, .9];
    legend.innerHTML = `<span class="modelab">Partisipasi tervalidasi per ${esc(level.toLowerCase())}</span><span>${pct(a, 0)}</span>
      <span class="ramp">${d3.range(9).map(i => `<i style="background:${d3.interpolateRgb('#f6f4f3', '#201e1d')(i / 8)}"></i>`).join('')}</span><span>${pct(b, 0)}</span>
      <span class="lgi"><i class="sw" style="background:${NO_DATA}"></i>Tanpa metadata valid</span>`;
    return;
  }
  if (S.mode === 'share') {
    const option = O[S.fokus], max = (S.sDom || [0, .75])[1];
    legend.innerHTML = `<span class="modelab">Perolehan ${esc(option.pendek)}</span><span>0%</span>
      <span class="ramp">${d3.range(9).map(i => `<i style="background:${d3.interpolateRgb(BGT, option.warna)(i / 8)}"></i>`).join('')}</span><span>${pct(max, 0)}</span>
      <span class="lgi"><i class="sw" style="background:${NO_DATA}"></i>Tanpa perolehan</span>`;
    return;
  }
  legend.innerHTML = `<span class="modelab">${S.mode === 'winner' ? 'Pemenang' : 'Pemenang · intensitas = margin'}</span>` +
    O.map(option => `<span class="lgi"><i class="sw" style="background:${option.warna}"></i>${esc(option.no)} ${esc(option.pendek)}</span>`).join('') +
    `<span class="lgi"><i class="sw" style="background:${TIE_COLOR}"></i>Seri</span>` +
    `<span class="lgi"><i class="sw" style="background:${NO_DATA}"></i>Tanpa perolehan</span>`;
}

/* ── GeoJSON lokal berbasis properties.key ───────────────────────── */
let projection, path, zoom, svg, gLayer, gRegions, dims = [0, 0];
function initMap() {
  svg = d3.select('#map');
  svg.selectAll('*').remove();
  gLayer = svg.append('g');
  gRegions = gLayer.append('g');
  zoom = d3.zoom().scaleExtent([1, 260]).on('zoom', event => {
    // Gestur pengguna membatalkan animasi drill-down agar keduanya tidak
    // sama-sama menulis transform gLayer.
    if (event.sourceEvent) gLayer.interrupt();
    gLayer.attr('transform', event.transform);
  });
  svg.call(zoom).on('dblclick.zoom', null);
  $('#zin').onclick = () => { gLayer.interrupt(); svg.transition().duration(300).call(zoom.scaleBy, 1.7); };
  $('#zout').onclick = () => { gLayer.interrupt(); svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.7); };
  $('#zrst').onclick = () => select(S.root);
}
/* Animasi pindah tingkat: tampilan baru dimulai pada kerangka tampilan
   sebelumnya lalu dianimasikan ke identitas, sehingga drill-down terlihat
   sebagai zoom in dan naik tingkat sebagai zoom out.  Transform dipasang
   langsung pada gLayer supaya scaleExtent zoom interaktif tetap [1, 260]. */
const VIEW_ZOOM_MS = 700;
function viewportTransform(collection) {
  if (!collection || !path) return null;
  const [[x0, y0], [x1, y1]] = path.bounds(collection);
  const [width, height] = dims;
  // Koleksi tanpa geometri terpakai memberi bounds tak-hingga; clamp di bawah
  // akan menyembunyikannya menjadi k yang finite dengan translate NaN.
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  const spanX = x1 - x0, spanY = y1 - y0;
  if (!(spanX > 0) || !(spanY > 0)) return null;
  const k = Math.max(0.02, Math.min(50, Math.min(width / spanX, height / spanY)));
  return d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(k)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
}
/* Identitas tampilan mengikuti koleksi yang benar-benar digambar, bukan node
   terpilih: memilih satu desa di dalam kecamatan yang sama tidak mengganti
   peta, jadi pan/zoom pengguna tidak boleh direset. */
function viewIdentity(node) {
  if (node.lv === 0) return { id: 'prov', key: 'ID' };
  if (node.lv === 1) return { id: `kab:${node.key}`, key: node.key };
  if (node.lv === 2) return { id: `kec:${node.key}`, key: node.key };
  const district = ancestorAt(node, 3);
  return { id: `desa:${district.key}`, key: district.key };
}
// Animasi hanya untuk perpindahan naik/turun pada cabang yang sama.  Lompatan
// ke wilayah lain (misalnya lewat pencarian) tidak punya hubungan spasial.
function relatedViews(from, to) {
  if (!from || !to) return false;
  if (from === to || from === 'ID' || to === 'ID') return true;
  return from.startsWith(to + '.') || to.startsWith(from + '.');
}
function enterView(previousCollection) {
  svg.interrupt();
  gLayer.interrupt();
  svg.call(zoom.transform, d3.zoomIdentity);
  const start = viewportTransform(previousCollection);
  if (!start) { gLayer.attr('transform', null); return; }
  gLayer.attr('transform', start.toString())
    .transition().duration(VIEW_ZOOM_MS).ease(d3.easeCubicOut)
    .attr('transform', d3.zoomIdentity.toString());
}
function featureNode(feature) {
  const key = feature && feature.properties && feature.properties.key;
  return key == null ? null : S.nodes.get(String(key)) || null;
}
function fitProjection(featureCollection) {
  const el = $('#viewport'), width = el.clientWidth || 800, height = el.clientHeight || 500;
  dims = [width, height];
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  projection = d3.geoMercator().fitExtent([[12, 12], [width - 12, height - 12]], featureCollection);
  path = d3.geoPath(projection);
}
async function loadGeoChunk(cache, key, folder) {
  if (cache.has(key)) return cache.get(key);
  const gisDir = S.D.gisDir;
  const pending = (async () => {
    try {
      const response = await fetch(`${gisDir}/${folder}/${encodeURIComponent(key)}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data && data.type === 'FeatureCollection' ? data : null;
    } catch (error) {
      console.warn(`GeoJSON ${folder}/${key} gagal dimuat`, error);
      return null;
    }
  })();
  cache.set(key, pending);
  const data = await pending;
  cache.set(key, data);
  return data;
}
const loadKab = P => P ? loadGeoChunk(S.geoKab, P.key, 'kab') : null;
const loadKecGIS = K => K ? loadGeoChunk(S.geoKec, K.key, 'kec') : null;
const loadDesaGIS = C => C ? loadGeoChunk(S.geoDesa, C.key, 'desa') : null;

async function geoForSelection(node) {
  if (node.lv === 0) return S.geoProv;
  if (node.lv === 1) return loadKab(node);
  if (node.lv === 2) return loadKecGIS(node);
  return loadDesaGIS(ancestorAt(node, 3));
}
async function prepareSelection(node) {
  const tasks = [];
  const P = provinceOf(node);
  if (node.lv >= 3) tasks.push(loadLeafResults(P));
  if (node.lv === 1) tasks.push(loadKab(node));
  if (node.lv === 2) tasks.push(loadKecGIS(node), loadKab(P));
  if (node.lv >= 3) tasks.push(loadDesaGIS(ancestorAt(node, 3)), loadKab(P));
  await Promise.all(tasks);
}
async function drawGeo() {
  const selectedKey = S.sel.key;
  const collection = await geoForSelection(S.sel);
  if (S.sel.key !== selectedKey) return false;
  if (!collection || !Array.isArray(collection.features) || !collection.features.length) {
    gRegions.selectAll('path').remove();
    // Tampilan grid memutus rangkaian peta; frame berikutnya mulai bersih.
    S.mapViewKey = null;
    S.mapViewNodeKey = null;
    S.mapCollection = null;
    return false;
  }
  const previousCollection = S.mapCollection, previousNodeKey = S.mapViewNodeKey;
  fitProjection(collection);
  const view = viewIdentity(S.sel);
  if (S.mapViewKey !== view.id) {
    S.mapViewKey = view.id;
    S.mapViewNodeKey = view.key;
    S.mapCollection = collection;
    enterView(relatedViews(previousNodeKey, view.key) ? previousCollection : null);
  }
  gRegions.selectAll('path').data(collection.features).join('path')
    .attr('class', feature => {
      const node = featureNode(feature);
      return 'region' + (node && node.key === S.sel.key ? ' sel' : '');
    })
    .attr('d', path)
    .attr('fill', feature => { const node = featureNode(feature); return node ? colorOf(node) : NO_DATA; })
    .style('pointer-events', feature => featureNode(feature) ? 'auto' : 'none')
    .on('click', (event, feature) => { const node = featureNode(feature); if (node) select(node); })
    .on('mousemove', (event, feature) => { const node = featureNode(feature); if (node) tipShow(event, node); })
    .on('mouseleave', tipHide);
  return true;
}
function renderLocator() {
  const P = provinceOf(S.sel), K = ancestorAt(S.sel, 2), locator = $('#locator');
  const collection = P && S.geoKab.get(P.key);
  // Provinsi tanpa geometri, misalnya Luar Negeri, tetap punya chunk kabupaten
  // yang kosong; fitExtent pada koleksi kosong menghasilkan proyeksi NaN.
  if (!P || !K || !collection || collection instanceof Promise
      || !Array.isArray(collection.features) || !collection.features.length) {
    locator.hidden = true;
    return;
  }
  locator.hidden = false;
  $('#loclab').textContent = P.name + ' › ' + K.name;
  const selection = d3.select('#locsvg');
  selection.selectAll('*').remove();
  const width = locator.clientWidth - 10, height = 76;
  selection.attr('viewBox', `0 0 ${width} ${height}`);
  const locatorPath = d3.geoPath(d3.geoMercator().fitExtent([[3, 3], [width - 3, height - 3]], collection));
  selection.append('g').selectAll('path').data(collection.features).join('path')
    .attr('d', locatorPath)
    .attr('fill', feature => { const node = featureNode(feature); return node && node.key === K.key ? '#ec3013' : '#d7d3d3'; })
    .attr('stroke', '#f3f2f2').attr('stroke-width', .5);
}

/* ── fallback grid ───────────────────────────────────────────────── */
function noDataLabel(node) { return `<span class="cw">${isTie(node) ? 'Perolehan seri' : 'Tidak ada perolehan'}</span>`; }
function renderGrid() {
  const wrap = $('#gridwrap'), node = S.sel, children = node.anak, O = opsi();
  if (!children.length) {
    wrap.innerHTML = `<div class="gridhead"><h4>${esc(node.name)}</h4></div>
      <p class="note">Ini adalah tingkat wilayah terakhir pada hierarki 2019.</p>`;
    return;
  }
  const rows = children.map(child => ({ child, votes: votesOf(child), total: sahOf(child), result: resultOf(child) }));
  rows.sort((a, b) => S.sort.d * (S.sort.k === 'n'
    ? a.child.name.localeCompare(b.child.name, 'id')
    : number(a.total) - number(b.total)));
  wrap.innerHTML = `<div class="gridhead"><h4>${ANAK[node.lv]} di ${esc(node.name)}</h4>
      <span class="note">${children.length.toLocaleString('id-ID')} wilayah · tampilan grid karena GeoJSON tidak tersedia</span></div>
    <div class="cellgrid">${rows.map(({ child, votes, total, result }) => {
      const winner = winnerOf(child);
      const blankTps = statOf(result, 'blank-tps') || 0;
      const outlierVoteTps = statOf(result, 'outlier-vote-tps') || 0;
      const tps = statOf(result, 'tps') || 0;
      const lead = winner == null ? noDataLabel(child) : `<div style="display:flex;align-items:baseline;gap:6px">
        <span class="cpct" style="color:${O[winner].warna}">${pct(votes[winner] / total, 0)}</span>
        <span class="cw">${esc(O[winner].no)} ${esc(O[winner].pendek)}</span></div>`;
      const bar = total > 0 ? `<div class="cbar">${votes.map((value, index) => value / total > .008
        ? `<i style="flex:${value};background:${O[index].warna}"></i>` : '').join('')}</div>` : '';
      const detail = !result || !result.present
        ? 'Data kontes tidak tersedia'
        : (tps > 0 && blankTps === tps
          ? `${fmt(blankTps)} rekaman TPS kosong`
          : `${fmt(total)} pilihan sah${blankTps > 0 ? ` · ${fmt(blankTps)} TPS kosong` : ''}${outlierVoteTps > 0 ? ` · ${fmt(outlierVoteTps)} TPS suara ekstrem` : ''}`);
      return `<button class="cell" data-k="${esc(child.key)}"><div class="cn">${esc(child.name)}</div>${lead}${bar}
        <div class="cw">${detail}</div></button>`;
    }).join('')}</div>`;
  wrap.querySelectorAll('.cell').forEach(button => {
    const child = S.nodes.get(button.dataset.k);
    button.onclick = () => select(child);
    button.onmousemove = event => tipShow(event, child);
    button.onmouseleave = tipHide;
  });
}

/* ── tooltip dan panel analisis ──────────────────────────────────── */
function tipElement() { return $('#tip'); }
function tipShow(event, node) {
  const tip = tipElement(), O = opsi(), result = resultOf(node), total = sahOf(node);
  if (!result || !result.present || !(total > 0)) {
    tip.innerHTML = `<b>${esc(node.name)}</b>${LEVELS[node.lv]} · tidak ada perolehan ${esc(election().nama)}`;
  } else {
    const top = result.votes.map((value, index) => [value, index]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    tip.innerHTML = `<b>${esc(node.name)}</b>${LEVELS[node.lv]} · ${fmt(total)} pilihan sah<br>` +
      top.map(([value, index]) => `<span style="color:${O[index].warna}">■</span> ${esc(O[index].pendek)} ${pct(value / total)}`).join('<br>');
  }
  tip.style.opacity = 1;
  tip.style.left = Math.min(window.innerWidth - 262, event.clientX + 14) + 'px';
  tip.style.top = Math.min(window.innerHeight - 96, event.clientY + 14) + 'px';
}
function tipHide() { const tip = tipElement(); if (tip) tip.style.opacity = 0; }

function coverageNote(node, result, choiceTotal) {
  const summary = S.sourceSummary && S.sourceSummary[S.pemilu];
  const anomalies = summary && summary.anomalies || {};
  const globalAudit = summary
    ? ` Audit seluruh sumber kontes: ${fmt(anomalies.invalid_stats_row || 0)} baris metadata anomali, ` +
      `${fmt(anomalies.option_sum_ne_suara_sah || 0)} baris dengan Σ opsi ≠ suara sah, dan ` +
      `${fmt(anomalies.blank_result_row || 0)} baris hasil kosong; ` +
      `${fmt(anomalies.outlier_vote_row || 0)} baris suara opsi ekstrem.` +
      (anomalies.administrasi_missing_row > 0
        ? ` ${fmt(anomalies.administrasi_missing_row)} baris tidak memuat blok administrasi sama sekali, sehingga partisipasi tidak dapat dihitung di TPS tersebut.`
        : '')
    : '';
  // Catatan sumber ditulis oleh builder tahun yang bersangkutan; 2024 memakai
  // catatan ini untuk menerangkan cakupan angka Sirekap yang tidak penuh.
  const sourceNote = summary && summary.note ? ` <b>Catatan sumber:</b> ${esc(summary.note)}` : '';
  const sourceCoverage = node.lv <= 2
    ? `${fmt(result.covered)} dari ${fmt(result.total)} kecamatan memiliki rekaman kontes ini`
    : (result.present ? 'Rekaman kontes tersedia untuk wilayah ini' : 'Rekaman kontes tidak tersedia untuk wilayah ini');
  if (!result.present) {
    const P = provinceOf(node), chunkError = node.lv >= 3 && P && S.leafErrors.get(P.key);
    return `<div class="banner"><span>⚑</span><span><b>Cakupan sumber:</b> ${sourceCoverage}.${chunkError ? ` Chunk hasil desa gagal dimuat (${esc(chunkError)}).` : ''}
      Tidak ada angka yang diisi atau diperkirakan.${globalAudit}${sourceNote}</span></div>`;
  }
  const totalTps = statOf(result, 'tps') || 0;
  const validatedTps = statOf(result, 'validated-tps') || 0;
  const blankTps = statOf(result, 'blank-tps') || 0;
  const outlierVoteTps = statOf(result, 'outlier-vote-tps') || 0;
  const reportedTps = Math.max(0, totalTps - blankTps);
  // Pada 2019 "tervalidasi" mensyaratkan baris tidak kosong, pada 2024 tidak:
  // sebuah TPS bisa kosong angka hasilnya tetapi punya administrasi yang utuh.
  // Karena itu selisih ini dihitung terhadap seluruh TPS, bukan terhadap TPS
  // yang bukan kosong, dan tidak diklaim lepas dari hitungan TPS kosong.
  const unvalidatedTps = Math.max(0, totalTps - validatedTps);
  const rawValid = statOf(result, 'suara-sah');
  const diff = rawValid == null ? null : choiceTotal - rawValid;
  const tpsText = totalTps > 0
    ? `<b>${fmt(reportedTps)}/${fmt(totalTps)} rekaman TPS</b> berisi angka hasil; metadata partisipasi tervalidasi pada <b>${fmt(validatedTps)} TPS</b> (${pct(validatedTps / totalTps)} dari seluruh rekaman).`
    : 'Jumlah TPS pada rekaman ini bernilai nol.';
  const blankText = blankTps > 0
    ? ` <b>${fmt(blankTps)} rekaman TPS kosong</b> dipertahankan sebagai kosong dan tidak dianggap sebagai angka nol yang dilaporkan.`
    : '';
  const voteOutlierText = outlierVoteTps > 0
    ? ` <b>${fmt(outlierVoteTps)} TPS memiliki suara opsi di atas 1.000</b> di luar Papua/luar negeri; angka CSV mentah dipertahankan dan dapat memengaruhi pemenang.`
    : '';
  const anomalyText = unvalidatedTps > 0
    ? ` <b>${fmt(unvalidatedTps)} TPS</b> tidak lolos pemeriksaan konsistensi metadata dan tidak dijumlahkan ke lima total partisipasi.`
    : (totalTps > 0 ? ' Seluruh TPS lolos pemeriksaan konsistensi metadata.' : '');
  // Pilpres results come from a scrape that carries no registered-voter column;
  // DPT is recovered per TPS from a second, narrower source.  Where that donor
  // has no matching TPS the turnout metadata is genuinely absent, not zero.
  const dptText = anomalies.no_dpt_donor > 0
    ? ` Sumber hasil kontes ini tidak memuat kolom pemilih terdaftar; DPT dipulihkan per TPS dari scrape KPU terpisah, dan <b>${fmt(anomalies.no_dpt_donor)} TPS</b> tidak mempunyai pasangan di sumber itu. Partisipasi karena itu hanya terhitung di sebagian wilayah dan bukan angka nasional.`
    : '';
  const diffText = diff && diff !== 0
    ? ` Jumlah perolehan opsi berbeda ${fmt(Math.abs(diff))} suara dari kolom suara-sah tervalidasi; total pilihan yang ditampilkan selalu Σ opsi.`
    : '';
  return `<div class="banner"><span>⚑</span><span><b>Cakupan sumber:</b> ${sourceCoverage}. ${tpsText}${blankText}${voteOutlierText}${anomalyText}${dptText}${diffText}${globalAudit}${sourceNote}</span></div>`;
}

let showAll = false;
function chain(node) { const out = []; while (node) { out.unshift(node); node = node.parent; } return out; }
function crumbText(node) { return chain(node).slice(0, -1).map(item => item.name).join(' › ') || 'Republik Indonesia'; }
function renderPanel() {
  const node = S.sel, O = opsi(), E = election(), result = resultOf(node);
  const votes = result ? result.votes : [], total = result && result.present ? votes.reduce((a, b) => a + b, 0) : null;
  const winner = winnerOf(node), margin = marginOf(node);
  const ranked = votes.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
  const shown = E.jenis === 'paslon' || showAll ? ranked : ranked.slice(0, 6);
  const bars = total > 0 ? shown.map(({ value, index }) => `
    <div class="bar">
      <div class="bn"><span class="dot" style="background:${O[index].warna}"></span><span>${esc(O[index].no)}. ${esc(O[index].pendek)}</span></div>
      <div class="bv">${pct(value / total)}</div>
      <div class="btrack"><i class="bfill" style="width:${(value / total * 100).toFixed(2)}%;background:${O[index].warna}"></i></div>
      <div class="babs">${fmt(value)} suara</div>
    </div>`).join('') : '<p class="note">Tidak ada perolehan positif yang dapat dihitung menjadi persentase.</p>';
  const tied = isTie(node);
  const winnerBlock = winner == null
    ? `<div class="winner" style="background:${tied ? TIE_COLOR : NO_DATA};color:#353230"><span class="wn">${tied ? 'Perolehan tertinggi seri' : 'Tidak ada pemenang yang dapat dihitung'}</span><span class="wp">${tied ? fmt(Math.max(...votes)) : '—'}</span></div>
       <div class="rmeta" style="margin-top:6px">${tied ? `${leadersOf(node).length} opsi memperoleh suara tertinggi yang sama.` : 'Perolehan hilang atau jumlah seluruh opsi nol.'}</div>`
    : `<div class="winner" style="background:${O[winner].warna}"><span class="wn">${esc(O[winner].no)}. ${esc(E.jenis === 'paslon' ? O[winner].pendek : O[winner].nama)}</span>
       <span class="wp">${pct(votes[winner] / total, 1)}</span></div>
       <div class="rmeta" style="margin-top:6px">Unggul ${pct(margin)} atas peringkat kedua</div>`;

  const registered = statOf(result, 'total-pemilih');
  const users = statOf(result, 'total-pengguna');
  const sourceTotal = statOf(result, 'suara-total');
  const sourceValid = statOf(result, 'suara-sah');
  const invalid = statOf(result, 'suara-tidak-sah');
  const tps = statOf(result, 'tps');
  const validatedTps = statOf(result, 'validated-tps');
  const blankTps = statOf(result, 'blank-tps');
  const outlierVoteTps = statOf(result, 'outlier-vote-tps');
  const turnout = turnoutOf(node);
  const invalidRate = sourceTotal > 0 ? invalid / sourceTotal : null;
  const children = node.anak;
  const childRows = children.map(child => {
    const childTotal = sahOf(child), childWinner = winnerOf(child), childVotes = votesOf(child);
    return { child, childTotal, childWinner, childVotes };
  }).sort((a, b) => number(b.childTotal) - number(a.childTotal));

  $('#panel').innerHTML = `
    <div class="psec">
      <div class="ph">${LEVELS[node.lv]}${node.code !== '0' ? ' · kode ' + esc(node.code) : ''}</div>
      <h2 class="rtitle">${esc(node.name)}</h2><div class="rmeta">${esc(crumbText(node))}</div>
      ${winnerBlock}
    </div>
    <div class="psec">
      <div class="ph">Perolehan suara</div><div class="bars">${bars}</div>
      ${E.jenis !== 'paslon' ? `<button class="more" id="moreb">${showAll ? '↑ Ringkas' : `↓ Lihat seluruh ${O.length} partai`}</button>` : ''}
    </div>
    <div class="psec">
      <div class="ph">Suara & partisipasi · metadata TPS tervalidasi</div>
      <dl class="kv">
        <dt>Pilihan sah (jumlah seluruh opsi)</dt><dd>${result.present ? fmt(total) : '—'}</dd>
        <dt>Suara sah (kolom sumber tervalidasi)</dt><dd>${fmt(sourceValid)}</dd>
        <dt>Suara tidak sah (tervalidasi)</dt><dd>${fmt(invalid)}</dd>
        <dt>Total suara (tervalidasi)</dt><dd>${fmt(sourceTotal)}</dd>
        <dt>Pemilih terdaftar (tervalidasi)</dt><dd>${fmt(registered)}</dd>
        <dt>Pengguna hak pilih (tervalidasi)</dt><dd>${fmt(users)}</dd>
        <dt>TPS tervalidasi / seluruh TPS</dt><dd>${fmt(validatedTps)} / ${fmt(tps)}</dd>
        <dt>Rekaman TPS dengan hasil kosong</dt><dd>${fmt(blankTps)}</dd>
        <dt>TPS dengan suara opsi ekstrem</dt><dd>${fmt(outlierVoteTps)}</dd>
      </dl>
      <div class="turnout"><i style="width:${turnout == null ? 0 : Math.max(0, Math.min(100, turnout * 100)).toFixed(1)}%"></i></div>
      <div class="rmeta">Partisipasi tervalidasi ${pct(turnout)}${turnout == null ? ' (pemilih terdaftar tidak tersedia di sumber)' : ''} · suara tidak sah ${pct(invalidRate)}</div>
    </div>
    <div class="psec">${coverageNote(node, result, total || 0)}</div>
    ${children.length ? `<div class="psec"><div class="ph">${ANAK[node.lv]} (${children.length.toLocaleString('id-ID')}) · klik untuk memperdalam</div>
      <div class="childlist">${childRows.map(({ child, childTotal, childWinner, childVotes }) => {
        if (childWinner == null) return `<button class="chi" data-k="${esc(child.key)}"><span class="dot" style="background:${isTie(child) ? TIE_COLOR : NO_DATA}"></span>
          <span class="cnm">${esc(child.name)}</span><span class="cvp">${isTie(child) ? 'Seri' : '—'}</span></button>`;
        return `<button class="chi" data-k="${esc(child.key)}"><span class="dot" style="background:${O[childWinner].warna}"></span>
          <span class="cnm">${esc(child.name)}</span><span class="cvp">${pct(childVotes[childWinner] / childTotal, 0)}</span></button>`;
      }).join('')}</div></div>` : ''}`;
  const more = $('#moreb');
  if (more) more.onclick = () => { showAll = !showAll; renderPanel(); };
  $('#panel').querySelectorAll('.chi[data-k]').forEach(element => {
    element.onclick = () => select(S.nodes.get(element.dataset.k));
  });
}

/* ── breadcrumb, tabel, pencarian, ekspor ────────────────────────── */
function renderCrumbs() {
  const items = chain(S.sel);
  $('#crumbs').innerHTML = items.map((node, index) =>
    `${index ? '<span class="crumbsep">›</span>' : ''}<button class="crumb" data-k="${esc(node.key)}" aria-current="${index === items.length - 1}">${esc(node.name)}</button>`).join('');
  $('#crumbs').querySelectorAll('.crumb').forEach(button => {
    button.onclick = () => select(S.nodes.get(button.dataset.k));
  });
}
function renderTable() {
  const node = S.sel, O = opsi(), children = node.anak, table = $('#dtable');
  if (!children.length) {
    table.innerHTML = `<tbody><tr><td style="padding:14px">Tidak ada rincian wilayah di bawah ${esc(node.name)}.</td></tr></tbody>`;
    return;
  }
  const indexes = O.map((_, index) => index);
  const rows = children.map(child => ({ child, votes: votesOf(child), total: sahOf(child), result: resultOf(child) }));
  rows.sort((a, b) => S.sort.d * (S.sort.k === 'n'
    ? a.child.name.localeCompare(b.child.name, 'id')
    : S.sort.k === 'v' ? number(a.total) - number(b.total)
      : (a.total > 0 ? a.votes[S.sort.k] / a.total : -1) - (b.total > 0 ? b.votes[S.sort.k] / b.total : -1)));
  table.innerHTML = `<thead><tr><th data-s="n">${ANAK[node.lv]}</th><th data-s="v" style="text-align:right">Pilihan sah (Σ opsi)</th>
      <th style="text-align:right">Partisipasi valid</th>
      <th style="text-align:right">TPS kosong</th>
      <th style="text-align:right">TPS suara ekstrem</th>
      ${indexes.map(index => `<th data-s="${index}" style="text-align:right">${esc(O[index].no)} ${esc(O[index].pendek)}</th>`).join('')}
      <th>Pemenang</th></tr></thead>
    <tbody>${rows.map(({ child, votes, total, result }) => {
      const winner = winnerOf(child), turnout = turnoutOf(child);
      return `<tr><td class="nm" data-k="${esc(child.key)}">${esc(child.name)}</td><td style="text-align:right">${fmt(total)}</td>
        <td style="text-align:right">${pct(turnout, 1)}</td>
        <td style="text-align:right">${fmt(statOf(result, 'blank-tps'))}</td>
        <td style="text-align:right">${fmt(statOf(result, 'outlier-vote-tps'))}</td>
        ${indexes.map(index => `<td style="text-align:right">${total > 0 ? pct(votes[index] / total, 1) : '—'}</td>`).join('')}
        <td>${winner == null ? '<span class="dot" style="display:inline-block;background:' + (isTie(child) ? TIE_COLOR : NO_DATA) + '"></span> ' + (isTie(child) ? 'Seri' : 'Tidak ada data')
          : `<span class="dot" style="display:inline-block;background:${O[winner].warna}"></span> ${esc(O[winner].pendek)}`}</td></tr>`;
    }).join('')}</tbody>`;
  table.querySelectorAll('th[data-s]').forEach(header => {
    header.onclick = () => {
      const key = header.dataset.s === 'n' || header.dataset.s === 'v' ? header.dataset.s : +header.dataset.s;
      S.sort = { k: key, d: S.sort.k === key ? -S.sort.d : -1 };
      renderTable();
      if (!S.hasGeoView) renderGrid();
    };
  });
  table.querySelectorAll('td.nm').forEach(cell => { cell.onclick = () => select(S.nodes.get(cell.dataset.k)); });
}
function buildIndex() {
  S.index = [];
  for (const node of S.nodes.values()) if (node.lv > 0) S.index.push({ node, text: node.name.toUpperCase() });
}
function search(query) {
  const q = query.trim().toUpperCase(), box = $('#qr');
  if (q.length < 2) { box.hidden = true; return; }
  const hits = [], seen = new Set();
  const add = item => { if (!seen.has(item.node.key) && hits.length < 40) { hits.push(item); seen.add(item.node.key); } };
  for (const item of S.index) if (item.text.startsWith(q)) add(item);
  if (hits.length < 25) for (const item of S.index) if (item.text.includes(q)) add(item);
  hits.sort((a, b) => a.node.lv - b.node.lv || a.node.name.localeCompare(b.node.name, 'id'));
  box.hidden = false;
  box.innerHTML = hits.slice(0, 30).map(({ node }) =>
    `<button data-k="${esc(node.key)}"><span class="rl">${LEVELS[node.lv]}</span><br>${esc(node.name)}
      <span class="rl"> — ${esc(crumbText(node))}</span></button>`).join('') || '<div style="padding:8px;font-size:12px">Tidak ditemukan.</div>';
  box.querySelectorAll('button').forEach(button => {
    button.onclick = () => { select(S.nodes.get(button.dataset.k)); box.hidden = true; $('#q').value = ''; };
  });
}
function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function exportCSV() {
  const node = S.sel, E = election(), children = node.anak;
  if (!children.length) return;
  const head = ['kode_wilayah', 'wilayah', 'tingkat', 'rekaman_tersedia', 'pilihan_sah_jumlah_opsi',
    ...S.statNames, ...E.voteColumns];
  const lines = [head.map(csvCell).join(',')];
  for (const child of children) {
    const result = resultOf(child), total = result && result.present ? result.votes.reduce((a, b) => a + b, 0) : null;
    const row = [child.key, child.name, ANAK[node.lv], result && result.present ? 1 : 0, total,
      ...S.statNames.map(name => statOf(result, name)), ...(result && result.present ? result.votes : new Array(E.opsi.length).fill(null))];
    lines.push(row.map(csvCell).join(','));
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const slug = node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || node.key.toLowerCase();
  link.href = url;
  link.download = `pemilu${S.D.id}-${S.pemilu}-${slug}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ── orkestrasi ──────────────────────────────────────────────────── */
function updateSourceNote() {
  const rootResult = resultOf(S.root);
  const coverage = rootResult && rootResult.total ? `${fmt(rootResult.covered)}/${fmt(rootResult.total)} kecamatan` : 'tanpa rekaman';
  const summary = S.sourceSummary && S.sourceSummary[S.pemilu];
  const sourceSize = summary
    ? `${fmt(summary.files)} file · ${fmt(summary.rows)} baris TPS`
    : S.D.sourceNote;
  const reported = summary && summary.total_tps
    ? ` · ${fmt(summary.reported_tps)}/${fmt(summary.total_tps)} TPS berisi angka`
    : '';
  $('#srcnote').textContent = `Pemilu ${S.D.id} · ${S.nodes.size.toLocaleString('id-ID')} wilayah · ${coverage} · ${sourceSize}${reported} · GeoJSON lokal, ${S.D.geoNote}`;
}
let selectVersion = 0;
async function select(node) {
  if (!node) return;
  const version = ++selectVersion;
  S.sel = node;
  showAll = false;
  await prepareSelection(node);
  if (version !== selectVersion) return;
  await renderAll();
}
async function renderAll() {
  renderCrumbs();
  renderModes();
  updateScale();
  renderLegend();
  S.hasGeoView = await drawGeo();
  $('#map').style.display = S.hasGeoView ? '' : 'none';
  $('#zoombtns').style.display = S.hasGeoView ? '' : 'none';
  $('#gridwrap').hidden = S.hasGeoView;
  if (!S.hasGeoView) renderGrid();
  $('#viewinfo').textContent = S.hasGeoView ? `Peta geografis · ${S.D.geoNote}` : 'Grid wilayah · GeoJSON tidak tersedia';
  renderLocator();
  renderPanel();
  renderTable();
  updateSourceNote();
}

/* ── pemuatan dataset per tahun ──────────────────────────────────── */
function loadingBox(text) {
  let box = $('#loading');
  if (!box) {
    box = document.createElement('div');
    box.id = 'loading';
    box.className = 'loading';
    $('#viewport').appendChild(box);
  }
  box.textContent = text;
  return box;
}
async function fetchJSON(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return response.json();
}
async function createBundle(dataset) {
  const provinceGeo = fetchJSON(`${dataset.gisDir}/provinsi.json`, 'provinsi.json')
    .catch(error => {
      console.warn('GeoJSON provinsi gagal dimuat; memakai grid wilayah.', error);
      return null;
    });
  const [raw, electionData, provinces] = await Promise.all([
    fetchJSON(dataset.hierarchy, dataset.hierarchy),
    fetchJSON(dataset.election, dataset.election),
    provinceGeo
  ]);
  if (raw.schema !== 2) throw new Error(`Skema wilayah ${raw.schema || 'lama'} tidak didukung; bangun ulang data schema 2.`);
  if (electionData.schema !== 2) throw new Error(`Skema hasil ${electionData.schema || 'lama'} tidak didukung; bangun ulang data schema 2.`);
  saveBundle(S.active);
  const bundle = blankBundle(dataset);
  restoreBundle(bundle);
  S.root = buildTree(raw);
  installElectionData(electionData, dataset);
  if (!PEMILU.length) throw new Error(`Tidak ada kontes Pemilu ${dataset.id} yang dapat dimuat.`);
  S.geoProv = provinces;
  S.sel = S.root;
  buildIndex();
  saveBundle(bundle);
  S.bundles.set(dataset.id, bundle);
  return bundle;
}
/* Wilayah dicocokkan lewat rantai nama, bukan kode: pemekaran Papua dan
   penomoran ulang desa membuat kode 2019 dan 2024 tidak sebanding. Pencocokan
   berhenti di tingkat terdalam yang masih ditemukan, jadi memilih satu desa di
   2019 lalu berpindah ke 2024 setidaknya mendarat di kecamatan yang sama. */
function nodeByNames(names) {
  let node = S.root;
  for (const name of names) {
    const next = node.anak.find(child => child.name === name);
    if (!next) break;
    node = next;
  }
  return node;
}
let yearVersion = 0;
async function selectYear(id, initial = false) {
  const dataset = datasetById(id);
  if (!initial && S.tahun === dataset.id) return;
  const version = ++yearVersion;
  const previous = S.active;
  const names = S.sel ? chain(S.sel).slice(1).map(node => node.name) : [];
  loadingBox(`Memuat data Pemilu ${dataset.id}…`);
  try {
    const cached = S.bundles.get(dataset.id);
    if (cached) { saveBundle(S.active); restoreBundle(cached); }
    else await createBundle(dataset);
  } catch (error) {
    console.error(error);
    // Bundel yang gagal dibangun tidak pernah disimpan, jadi tahun sebelumnya
    // dipulihkan utuh dan pengguna tidak terjebak pada state setengah jadi.
    if (previous) restoreBundle(previous);
    loadingBox(`Gagal memuat data ${dataset.id}: ${error.message}`);
    renderYears();
    return;
  }
  if (version !== yearVersion) return;
  // Dua peralihan cepat dapat selesai di luar urutan; bundel yang menang harus
  // yang diminta terakhir, bukan yang kebetulan selesai belakangan.
  const target = S.bundles.get(dataset.id);
  if (target && S.active !== target) { saveBundle(S.active); restoreBundle(target); }
  // Pilihan opsi, urutan tabel, dan kerangka peta tidak sebanding antartahun.
  S.fokus = 0;
  S.sort = { k: 'v', d: -1 };
  showAll = false;
  S.mapViewKey = null;
  S.mapViewNodeKey = null;
  S.mapCollection = null;
  S.sel = names.length ? nodeByNames(names) : S.root;
  document.title = `Peta Hasil Pemilu Indonesia ${dataset.id}`;
  renderYears();
  renderTabs();
  await select(S.sel);
  const box = $('#loading');
  if (box) box.remove();
}

async function boot() {
  const requested = new URLSearchParams(location.search).get('tahun');
  const startId = DATASETS.some(dataset => dataset.id === requested) ? requested : DEFAULT_YEAR;
  try {
    initMap();
    await selectYear(startId, true);
  } catch (error) {
    console.error(error);
    loadingBox('Gagal memuat data: ' + error.message);
  }

  $('#q').addEventListener('input', event => search(event.target.value));
  $('#q').addEventListener('blur', () => setTimeout(() => { $('#qr').hidden = true; }, 180));
  $('#ttoggle').onclick = () => $('#tablewrap').classList.toggle('open');
  $('#tcsv').onclick = exportCSV;
  addEventListener('resize', () => { if (S.sel) renderAll(); });
  addEventListener('keydown', event => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;
    if ((event.key === 'Escape' || event.key === 'Backspace') && S.sel && S.sel.parent) { event.preventDefault(); select(S.sel.parent); }
    if (event.key === '/') { event.preventDefault(); $('#q').focus(); }
    if (event.key === 't' || event.key === 'T') {
      const order = DATASETS.map(dataset => dataset.id);
      const next = order[(order.indexOf(S.tahun) + 1) % order.length];
      event.preventDefault();
      selectYear(next);
      return;
    }
    const index = ['1', '2', '3', '4'].indexOf(event.key);
    const tabs = document.querySelectorAll('.tab');
    if (index >= 0 && tabs[index]) tabs[index].click();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PARTY_SPEC, PARTY_SPEC_2024, PASLON_2019, PASLON_2024, DATASETS, CONTEST_ORDER,
    CONTEST_NAMES, S, normalizeContests, buildTree, installElectionData,
    parseEntry, combineResults, resultOf, leadersOf, winnerOf, isTie, marginOf, featureNode, columnKey,
    selectYear, select, nodeByNames
  };
}
if (typeof document !== 'undefined') boot();
