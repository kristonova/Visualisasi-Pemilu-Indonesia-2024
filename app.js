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

/* DPD 2024: setiap provinsi adalah satu daerah pemilihan berkursi empat dengan
   daftar calonnya sendiri, jadi kolom `calon-<nomor urut>` baru bermakna
   bersama roster provinsi yang dikirim builder di election2024.json. Warna
   calon diberikan per provinsi menurut peringkat perolehan tingkat provinsi:
   empat besar (kursi indikatif) memakai hue tegas, peringkat 5–10 hue lembut,
   dan sisanya satu warna "calon lain" karena 54 hue tidak mungkin dibedakan. */
const DPD_SEATS = 4;
const CANDIDATE_COLORS = [
  ...[25, 245, 150, 305].map(hue => OKL(.585, .175, hue)),
  ...[75, 195, 350, 110, 275, 45].map(hue => OKL(.72, .11, hue))
];
// Abu kebiruan: cukup gelap dan dingin agar tidak tertukar dengan abu hangat
// NO_DATA maupun TIE_COLOR.
const OTHER_CANDIDATE = OKL(.72, .04, 240);
// Tingkat nasional DPD tidak punya pemenang: provinsi diwarnai satu hue
// menurut porsi (atau selisih) calon teratasnya sendiri.
const TOP_SHARE_COLOR = OKL(.42, .13, 280);

const partyIndex = spec => new Map(spec.map(party => [columnKey(party.column), party]));
// Urutan tab mengikuti lima surat suara yang diterima pemilih.
const CONTEST_ORDER = ['pilpres', 'dpr', 'dpd', 'dprdprov', 'dprdkab'];
const CONTEST_NAMES = {
  pilpres: ['Pemilu Presiden', 'Presiden'],
  dpr: ['Pemilihan Legislatif', 'DPR RI'],
  dpd: ['Pemilihan Legislatif', 'DPD RI'],
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
    // Sumber 2019 tidak memuat hasil DPD sama sekali.
    contests: CONTEST_ORDER.filter(id => id !== 'dpd'),
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
  // `batas` adalah preferensi pengguna yang bertahan lintas wilayah dan tahun;
  // `sorot` menyorot unit peta yang dimenangkan satu opsi.
  batas: 'berjenjang', sorot: null, tableAll: false,
  nodes: new Map(), index: [], results: new Map(), contestsById: new Map(),
  statNames: [], statIndex: new Map(), election: null, sourceSummary: null,
  geoProv: null, geoKab: new Map(), geoKec: new Map(), geoDesa: new Map(), geoDesaProv: new Map(),
  leafLoads: new Map(), leafErrors: new Map(), sort: { k: 'v', d: -1 },
  mapViewKey: null, mapViewNodeKey: null, mapCollection: null, hasGeoView: false
};

/* Bidang S yang milik satu tahun saja. Peralihan tahun menyimpan bidang ini ke
   bundel tahun yang ditinggalkan lalu memuat bundel tahun tujuan, sehingga sisa
   kode tetap membaca S seperti biasa dan pohon yang sudah dimuat tidak perlu
   diambil ulang dari jaringan. */
const BUNDLE_FIELDS = ['D', 'pemilu', 'sel', 'root', 'nodes', 'index', 'results',
  'contestsById', 'statNames', 'statIndex', 'election', 'sourceSummary',
  'geoProv', 'geoKab', 'geoKec', 'geoDesa', 'geoDesaProv', 'leafLoads', 'leafErrors'];

function blankBundle(D) {
  return {
    D, pemilu: null, sel: null, root: null, nodes: new Map(), index: [],
    results: new Map(), contestsById: new Map(), statNames: [], statIndex: new Map(),
    election: null, sourceSummary: null, geoProv: null, geoKab: new Map(),
    geoKec: new Map(), geoDesa: new Map(), geoDesaProv: new Map(),
    leafLoads: new Map(), leafErrors: new Map(), PEMILU: []
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

/* Label ringkas calon DPD untuk legenda, tab, dan tabel: gelar di belakang
   koma dan sapaan/gelar di depan dibuang, lalu huruf kapital sumber dijadikan
   huruf judul. Nama lengkap tetap dipakai di blok pemenang dan ekspor. */
const NAME_PREFIX = /^(?:(?:prof|drs|dra|drh|drg|dr|ir|hj|h|k\.\s?h|kh|tgh|tgk|ust|pdt|apt)\.\s*)+/i;
function candidateShortName(name) {
  const full = String(name || '').trim();
  const base = full.split(',')[0].replace(NAME_PREFIX, '').trim() || full;
  return base.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (_, lead, letter) => lead + letter.toUpperCase());
}

function candidateContest(source, dataset) {
  const voteColumns = Array.isArray(source.vote_columns) ? source.vote_columns.slice() : [];
  // Opsi posisi tanpa roster tidak pernah ditampilkan: di tingkat nasional
  // "calon nomor 3" berarti 38 orang berbeda.
  const positional = voteColumns.map((column, index) => ({
    column, no: String(index + 1), pendek: `Calon ${index + 1}`, nama: `Calon nomor urut ${index + 1}`,
    index, warna: OTHER_CANDIDATE, absent: true
  }));
  const rosters = new Map();
  for (const [province, rows] of Object.entries(source.rosters || {})) {
    const byColumn = new Map((Array.isArray(rows) ? rows : []).map(row => [`calon-${row.no}`, row]));
    rosters.set(String(province), voteColumns.map((column, index) => {
      const row = byColumn.get(column);
      if (!row) return { ...positional[index] };
      const nama = String(row.nama || '').trim() || `Calon nomor urut ${row.no}`;
      return {
        column, no: String(row.no), pendek: candidateShortName(nama), nama,
        jk: row.jk || '', domisili: row.domisili || '', index,
        warna: OTHER_CANDIDATE, rank: null, seat: false
      };
    }));
  }
  const [kicker, nama] = CONTEST_NAMES.dpd;
  return {
    id: 'dpd', kicker: `${kicker} ${dataset.id}`, nama: `${nama} ${dataset.id}`,
    opsi: positional, rosters, jenis: 'calon',
    sourceIndex: source.sourceIndex,
    sourceIndexes: voteColumns.map((_, index) => index),
    voteColumns
  };
}

/* Peringkat dan warna calon ditetapkan sekali dari total tingkat provinsi,
   sehingga seorang calon memakai warna yang sama dari provinsi hingga desa. */
function rankCandidates(E, map) {
  for (const P of S.root.anak) {
    const O = E.rosters.get(P.code);
    if (!O) continue;
    const result = map.get(P.key);
    const votes = result && result.present ? result.votes : [];
    shownIndexes(O)
      .sort((a, b) => number(votes[b]) - number(votes[a]) || a - b)
      .forEach((index, position) => {
        const option = O[index], hasVotes = number(votes[index]) > 0;
        option.rank = hasVotes ? position + 1 : null;
        option.seat = hasVotes && position < DPD_SEATS;
        option.warna = hasVotes && position < CANDIDATE_COLORS.length ? CANDIDATE_COLORS[position] : OTHER_CANDIDATE;
      });
  }
}

function normalizeContests(rawContests, dataset = DATASETS[DATASETS.length - 1]) {
  const paslonSpec = dataset.paslon || PASLON_2019;
  const partySpec = dataset.parties || PARTY_SPEC;
  const partyByColumn = partyIndex(partySpec);
  const rows = Array.isArray(rawContests) ? rawContests : [];
  const byId = new Map(rows.map((contest, sourceIndex) => [contest.id, { ...contest, sourceIndex }]));
  return (dataset.contests || CONTEST_ORDER).map(id => {
    const source = byId.get(id);
    if (!source) return null;
    if (id === 'dpd') return candidateContest(source, dataset);
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
    if (E.jenis === 'calon') rankCandidates(E, map);
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
/* Opsi yang berlaku untuk sebuah wilayah. Kontes partai dan paslon memakai satu
   daftar nasional; DPD memakai roster provinsi wilayah itu, sedangkan tingkat
   nasional dan provinsi tanpa surat suara DPD (luar negeri) hanya punya opsi
   posisi yang seluruhnya `absent`. */
function opsiFor(node, E = election()) {
  if (!E) return [];
  if (E.jenis !== 'calon') return E.opsi;
  const P = provinceOf(node);
  return (P && E.rosters.get(P.code)) || E.opsi;
}
function opsi() { return opsiFor(S.sel); }
function shownIndexes(O) {
  return O.map((option, index) => option.absent ? -1 : index).filter(index => index >= 0);
}
/* Tingkat nasional DPD: 38 provinsi, 38 daftar calon, tanpa pemenang nasional. */
function topShareView() {
  const E = election();
  return !!(E && E.jenis === 'calon' && S.sel && S.sel.lv === 0);
}
function topShareOf(node) {
  const total = sahOf(node);
  return total > 0 ? Math.max(...votesOf(node)) / total : null;
}
function topShareValue(node) { return S.mode === 'margin' ? marginOf(node) : topShareOf(node); }
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
/* Unit yang diwarnai peta: desa di mode Batas Desa, selain itu wilayah anak.
   Skala, legenda, hitungan menang, dan tabel membaca daftar yang sama. */
function activeUnits() {
  if (!S.sel) return [];
  if (desaView()) return leavesOf(S.sel);
  return S.sel.anak.length ? S.sel.anak : [S.sel];
}
function updateScale() {
  const units = activeUnits();
  const turnouts = units.map(turnoutOf).filter(value => value != null && value >= 0);
  S.tDom = turnouts.length
    ? [d3.quantile(turnouts.slice().sort(d3.ascending), .02), d3.quantile(turnouts.slice().sort(d3.ascending), .98)]
    : [.55, .9];
  if (S.tDom[1] - S.tDom[0] < .02) S.tDom = [Math.max(0, S.tDom[0] - .01), S.tDom[1] + .01];
  const national = topShareView();
  const shares = units.map(node => {
    const total = sahOf(node), votes = votesOf(node);
    if (!(total > 0)) return null;
    return national ? topShareValue(node) : votes[S.fokus] / total;
  }).filter(value => value != null);
  // Ribuan desa selalu memuat beberapa desa kecil berporsi hampir 100%; puncak
  // skala desa memakai kuantil 98% agar ramp tidak pudar karena segelintir desa.
  const top = desaView() && shares.length > 50
    ? d3.quantile(shares.slice().sort(d3.ascending), .98)
    : d3.max(shares);
  S.sDom = [0, Math.max(.08, top || .5)];
}
function colorOf(node) {
  if (S.mode === 'turnout') {
    const turnout = turnoutOf(node);
    if (turnout == null) return NO_DATA;
    const [a, b] = S.tDom || [.55, .9];
    return d3.interpolateRgb('#f6f4f3', '#201e1d')(Math.min(1, Math.max(0, (turnout - a) / (b - a))));
  }
  const total = sahOf(node);
  if (!(total > 0)) return NO_DATA;
  if (topShareView()) {
    const max = (S.sDom || [0, .75])[1];
    return d3.interpolateRgb(BGT, TOP_SHARE_COLOR)(Math.min(1, number(topShareValue(node)) / max));
  }
  const O = opsiFor(node);
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
  const missing = CONTEST_ORDER.filter(id => !S.contestsById.has(id)).map(id => CONTEST_NAMES[id][1]);
  const kicker = $('#yearnote');
  if (kicker) {
    kicker.textContent = `${PEMILU.length} kontes${missing.length ? ` · ${missing.join(', ')} tidak tersedia` : ''}`;
  }
}
function renderTabs() {
  $('#tabs').innerHTML = PEMILU.map(E =>
    `<button class="tab" role="tab" data-e="${E.id}" aria-selected="${E.id === S.pemilu}">
      <span class="tk">${esc(E.kicker)}</span><span class="tn">${esc(E.nama)}</span></button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(button => {
    button.onclick = () => {
      S.pemilu = button.dataset.e;
      S.sorot = null;
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
  // Roster DPD berganti antarprovinsi, jadi fokus yang tidak tercetak di
  // provinsi aktif pindah ke calon pertama yang ada.
  const O = opsi(), shown = shownIndexes(O);
  if (shown.length && !shown.includes(S.fokus)) S.fokus = shown[0];
  const isShare = S.mode === 'share' && !topShareView() && shown.length > 0;
  $('#focussel').hidden = !isShare;
  $('#focuslab').hidden = !isShare;
  if (isShare) {
    $('#focussel').innerHTML = shown.map(index =>
      `<option value="${index}" ${index === S.fokus ? 'selected' : ''}>${esc(O[index].no)}. ${esc(O[index].pendek)}</option>`).join('');
    $('#focussel').onchange = event => { S.fokus = +event.target.value; renderAll(); };
  }
}
/* Mode Batas: "Berjenjang" menggambar wilayah anak; "Desa" menggambar seluruh
   desa provinsi/kab terpilih dengan batas anak sebagai garis tegas.  Pilihan
   ini preferensi: di tingkat nasional ia menunggu sampai provinsi dipilih. */
function renderBatas() {
  const seg = $('#batasseg');
  if (!seg || !S.sel) return;
  const available = S.sel.lv >= 1 && desaAvailable(S.sel);
  const hint = S.sel.lv === 0 ? 'Pilih provinsi untuk melihat batas desa' : 'Wilayah ini tidak memiliki poligon desa';
  seg.innerHTML = [['berjenjang', 'Berjenjang'], ['desa', 'Desa']].map(([key, label]) => {
    const disabled = key === 'desa' && !available;
    return `<label class="seg-opt"${disabled ? ` title="${esc(hint)}"` : ''}><input type="radio" name="batas" value="${key}"
      ${key === S.batas ? 'checked' : ''}${disabled ? ' disabled' : ''}>${label}</label>`;
  }).join('');
  seg.querySelectorAll('input').forEach(input => {
    input.onchange = () => { if (input.checked) setBatas(input.value); };
  });
}
function setBatas(value) {
  if (S.batas === value) return Promise.resolve();
  S.batas = value;
  // select() memuat berkas desa provinsi dan hasil desa bila belum ada.
  return select(S.sel);
}
function setSorot(index) {
  S.sorot = S.sorot === index ? null : index;
  return renderAll();
}
/* Nama unit peta untuk label: "desa", "kab/kota", ... */
function unitNoun(units = activeUnits()) {
  const level = units.length ? units[0].lv : S.sel.lv;
  return ['wilayah', 'provinsi', 'kab/kota', 'kecamatan', 'desa'][level] || 'wilayah';
}
/* Isi legenda sebagai data, dipakai legenda halaman dan gambar PNG. */
function legendModel() {
  const O = opsi(), noun = unitNoun();
  const noData = { warna: NO_DATA, label: 'Tanpa perolehan' };
  const line = desaView() ? (S.sel.lv === 1 ? 'Batas kab/kota' : 'Batas kecamatan') : null;
  const ramp = (from, to, lo, hi) => ({ lo, hi, colors: d3.range(9).map(i => d3.interpolateRgb(from, to)(i / 8)) });
  if (S.mode === 'turnout') {
    const [a, b] = S.tDom || [.55, .9];
    return { title: `Partisipasi tervalidasi per ${noun}`, ramp: ramp('#f6f4f3', '#201e1d', pct(a, 0), pct(b, 0)),
      items: [{ warna: NO_DATA, label: 'Tanpa metadata valid' }], line };
  }
  if (topShareView()) {
    const max = (S.sDom || [0, .75])[1];
    const title = S.mode === 'margin'
      ? 'Selisih calon teratas atas peringkat kedua di provinsinya'
      : 'Porsi suara calon teratas di provinsinya';
    return { title, ramp: ramp(BGT, TOP_SHARE_COLOR, '0%', pct(max, 0)), items: [noData], line };
  }
  const shown = shownIndexes(O);
  if (!shown.length) return { title: `Surat suara ${election().nama} tidak dibagikan di wilayah ini`, items: [noData], line };
  if (S.mode === 'share') {
    const option = O[S.fokus], max = (S.sDom || [0, .75])[1];
    return { title: `Perolehan ${option.pendek} per ${noun}`, ramp: ramp(BGT, option.warna, '0%', pct(max, 0)), items: [noData], line };
  }
  // Legenda DPD hanya memuat calon yang unggul di wilayah yang tampak; 54
  // calon Jawa Barat tidak muat, dan calon yang tidak unggul tidak berwarna.
  let listed = shown, others = false;
  if (election().jenis === 'calon') {
    const leaders = new Set(activeUnits().map(winnerOf).filter(index => index != null));
    listed = shown.filter(index => leaders.has(index) && O[index].warna !== OTHER_CANDIDATE);
    others = [...leaders].some(index => O[index].warna === OTHER_CANDIDATE);
  }
  return {
    title: `${S.mode === 'winner' ? 'Pemenang' : 'Pemenang · intensitas = margin'} per ${noun}`,
    items: [
      ...listed.map(index => ({ warna: O[index].warna, label: `${O[index].no} ${O[index].pendek}`, opsi: index })),
      ...(others ? [{ warna: OTHER_CANDIDATE, label: 'Calon di luar 10 besar provinsi' }] : []),
      { warna: TIE_COLOR, label: 'Seri' }, noData
    ],
    line
  };
}
function renderLegend() {
  const model = legendModel(), legend = $('#legend');
  // Item opsi adalah tombol sorot: klik sekali menyorot, klik lagi melepas.
  const item = entry => entry.opsi != null
    ? `<button class="lgi lgb" data-o="${entry.opsi}" aria-pressed="${S.sorot === entry.opsi}" title="Sorot ${esc(unitNoun())} yang dimenangkan ${esc(entry.label)}"><i class="sw" style="background:${entry.warna}"></i>${esc(entry.label)}</button>`
    : `<span class="lgi"><i class="sw" style="background:${entry.warna}"></i>${esc(entry.label)}</span>`;
  legend.innerHTML = `<span class="modelab">${esc(model.title)}</span>` +
    (model.ramp ? `<span>${model.ramp.lo}</span><span class="ramp">${model.ramp.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span><span>${model.ramp.hi}</span>` : '') +
    model.items.map(item).join('') +
    (model.line ? `<span class="lgi"><i class="ln"></i>${esc(model.line)}</span>` : '');
  legend.classList.toggle('sorot', S.sorot != null);
  legend.querySelectorAll('[data-o]').forEach(button => { button.onclick = () => setSorot(+button.dataset.o); });
}

/* ── GeoJSON lokal berbasis properties.key ───────────────────────── */
let projection, path, zoom, svg, gLayer, gRegions, gOutline, dims = [0, 0];
// Koleksi dan ukuran yang atribut `d`-nya sudah terhitung; selama keduanya
// sama, ganti kontes, mode, atau sorot cukup mewarnai ulang ribuan path.
let drawnPaths = null;
function initMap() {
  svg = d3.select('#map');
  svg.selectAll('*').remove();
  gLayer = svg.append('g');
  gRegions = gLayer.append('g');
  gOutline = gLayer.append('g');
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
  if (desaView(node)) return { id: `${node.lv === 1 ? 'dprov' : 'dkab'}:${node.key}`, key: node.key };
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
const loadDesaProv = P => P ? loadGeoChunk(S.geoDesaProv, P.key, 'desaprov') : null;

/* ── mode Batas Desa ─────────────────────────────────────────────── */
const geoKeySets = new WeakMap();
function geoKeys(collection) {
  if (!collection || !Array.isArray(collection.features)) return new Set();
  let keys = geoKeySets.get(collection);
  if (!keys) {
    keys = new Set(collection.features.map(feature => String(feature.properties && feature.properties.key)));
    geoKeySets.set(collection, keys);
  }
  return keys;
}
// Luar negeri tidak punya poligon di provinsi.json, jadi tidak punya peta desa.
function desaAvailable(node) {
  const P = provinceOf(node);
  return !!P && geoKeys(S.geoProv).has(P.key);
}
function wantsDesa(node) {
  return S.batas === 'desa' && !!node && (node.lv === 1 || node.lv === 2) && desaAvailable(node);
}
function leavesOf(node) {
  if (!node._leaves) {
    const out = [];
    const walk = item => { if (item.lv === 4) out.push(item); else item.anak.forEach(walk); };
    walk(node);
    node._leaves = out;
  }
  return node._leaves;
}
const subsets = new WeakMap();
function subsetFor(collection, prefix) {
  let byPrefix = subsets.get(collection);
  if (!byPrefix) subsets.set(collection, byPrefix = new Map());
  if (!byPrefix.has(prefix)) {
    byPrefix.set(prefix, {
      type: 'FeatureCollection',
      features: collection.features.filter(feature => String(feature.properties && feature.properties.key).startsWith(prefix))
    });
  }
  return byPrefix.get(prefix);
}
/* Koleksi desa yang digambar untuk node, atau null bila mode Batas Desa tidak
   berlaku atau berkas desa provinsinya gagal/kosong: peta lalu kembali ke
   geometri berjenjang, dan seluruh panel ikut membaca wilayah anak. */
function desaFill(node) {
  if (!wantsDesa(node)) return null;
  const desa = S.geoDesaProv.get(provinceOf(node).key);
  if (!desa || desa instanceof Promise || !Array.isArray(desa.features)) return null;
  const fill = node.lv === 1 ? desa : subsetFor(desa, node.key + '.');
  return fill.features.length ? fill : null;
}
function desaView(node = S.sel) { return !!desaFill(node); }

async function geoForSelection(node) {
  const desa = desaFill(node);
  if (desa) {
    const outline = node.lv === 1 ? await loadKab(node) : await loadKecGIS(node);
    return { fill: desa, outline };
  }
  if (node.lv === 0) return { fill: S.geoProv };
  if (node.lv === 1) return { fill: await loadKab(node) };
  if (node.lv === 2) return { fill: await loadKecGIS(node) };
  return { fill: await loadDesaGIS(ancestorAt(node, 3)) };
}
async function prepareSelection(node) {
  const tasks = [];
  const P = provinceOf(node), desa = wantsDesa(node);
  if (node.lv >= 3 || desa) tasks.push(loadLeafResults(P));
  if (node.lv === 1) tasks.push(loadKab(node));
  if (node.lv === 2) tasks.push(loadKecGIS(node), loadKab(P));
  if (node.lv >= 3) tasks.push(loadDesaGIS(ancestorAt(node, 3)), loadKab(P));
  const cold = desa && !S.geoDesaProv.has(P.key);
  if (desa) tasks.push(loadDesaProv(P));
  const box = cold ? loadingBox(`Memuat batas ${fmt(leavesOf(P).length)} desa ${P.name}…`) : null;
  try {
    await Promise.all(tasks);
  } finally {
    if (box) box.remove();
  }
}
async function drawGeo() {
  const selectedKey = S.sel.key;
  const { fill: collection, outline } = await geoForSelection(S.sel);
  if (S.sel.key !== selectedKey) return false;
  if (!collection || !Array.isArray(collection.features) || !collection.features.length) {
    gRegions.selectAll('path').remove();
    gOutline.selectAll('path').remove();
    // Tampilan grid memutus rangkaian peta; frame berikutnya mulai bersih.
    S.mapViewKey = null;
    S.mapViewNodeKey = null;
    S.mapCollection = null;
    drawnPaths = null;
    return false;
  }
  const previousCollection = S.mapCollection, previousNodeKey = S.mapViewNodeKey;
  const el = $('#viewport'), width = el.clientWidth || 800, height = el.clientHeight || 500;
  const reproject = !drawnPaths || drawnPaths.collection !== collection
    || drawnPaths.width !== width || drawnPaths.height !== height;
  if (reproject) fitProjection(collection);
  const view = viewIdentity(S.sel);
  if (S.mapViewKey !== view.id) {
    S.mapViewKey = view.id;
    S.mapViewNodeKey = view.key;
    S.mapCollection = collection;
    enterView(relatedViews(previousNodeKey, view.key) ? previousCollection : null);
  }
  svg.classed('dense', collection.features.length > 1500);
  const regions = gRegions.selectAll('path').data(collection.features).join('path');
  if (reproject) regions.attr('d', path);
  drawnPaths = { collection, width, height };
  const sorot = S.sorot;
  regions
    .attr('class', feature => {
      const node = featureNode(feature);
      return 'region' + (node && node.key === S.sel.key ? ' sel' : '')
        + (sorot != null && node && winnerOf(node) !== sorot ? ' dim' : '');
    })
    .attr('fill', feature => { const node = featureNode(feature); return node ? colorOf(node) : NO_DATA; })
    .style('pointer-events', feature => featureNode(feature) ? 'auto' : 'none')
    // Klik selalu turun satu tingkat: desa di peta provinsi membuka kab/kotanya,
    // sehingga mode Batas Desa tetap berjenjang seperti mode biasa.
    .on('click', (event, feature) => {
      const node = featureNode(feature);
      if (node) select(ancestorAt(node, Math.min(S.sel.lv + 1, node.lv)));
    })
    .on('mousemove', (event, feature) => { const node = featureNode(feature); if (node) tipShow(event, node); })
    .on('mouseleave', tipHide);
  gOutline.selectAll('path').data(outline && Array.isArray(outline.features) ? outline.features : []).join('path')
    .attr('class', 'bound')
    .attr('d', path);
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
  const wrap = $('#gridwrap'), node = S.sel, children = node.anak;
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
      const winner = winnerOf(child), O = opsiFor(child);
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
/* Desa pada peta provinsi atau kab/kota: sebut kecamatan dan kab/kotanya. */
function tipContext(node) {
  if (!S.sel || node.lv <= S.sel.lv + 1) return '';
  return chain(node).slice(S.sel.lv + 1, -1).reverse()
    .map(item => item.lv === 3 ? `Kec. ${item.name}` : item.name).join(' · ');
}
function tipShow(event, node) {
  const tip = tipElement(), O = opsiFor(node), result = resultOf(node), total = sahOf(node);
  const context = tipContext(node), head = `<b>${esc(node.name)}</b>${context ? esc(context) + '<br>' : ''}`;
  if (!result || !result.present || !(total > 0)) {
    tip.innerHTML = `${head}${LEVELS[node.lv]} · tidak ada perolehan ${esc(election().nama)}`;
  } else {
    const top = shownIndexes(O).map(index => [result.votes[index], index])
      .sort((a, b) => b[0] - a[0]).slice(0, 3);
    tip.innerHTML = `${head}${LEVELS[node.lv]} · ${fmt(total)} pilihan sah<br>` +
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
  const E = election();
  const seatText = E && E.jenis === 'calon' && node.lv >= 1
    ? ` <b>Kursi indikatif</b> menandai empat besar perolehan tingkat provinsi yang dihitung dari TPS berangka saja; ini bukan penetapan calon terpilih oleh KPU.`
    : '';
  return `<div class="banner"><span>⚑</span><span><b>Cakupan sumber:</b> ${sourceCoverage}. ${tpsText}${blankText}${voteOutlierText}${anomalyText}${dptText}${diffText}${seatText}${globalAudit}${sourceNote}</span></div>`;
}

let showAll = false;
function chain(node) { const out = []; while (node) { out.unshift(node); node = node.parent; } return out; }
function crumbText(node) { return chain(node).slice(0, -1).map(item => item.name).join(' › ') || 'Republik Indonesia'; }
function seatBadge(option) {
  return option.seat
    ? '<em class="seat" title="Empat besar perolehan tingkat provinsi dari TPS berangka; bukan penetapan KPU">kursi indikatif</em>'
    : '';
}
/* Blok pemenang dan bar perolehan untuk wilayah yang punya satu daftar opsi:
   seluruh kontes partai/paslon, serta DPD dari tingkat provinsi ke bawah. */
function choiceBlocks(node, E, votes, total) {
  const O = opsi(), shown = shownIndexes(O);
  const winner = winnerOf(node), margin = marginOf(node);
  const ranked = shown.map(index => ({ value: number(votes[index]), index })).sort((a, b) => b.value - a.value);
  const listed = E.jenis === 'paslon' || showAll ? ranked : ranked.slice(0, 6);
  const bars = !shown.length
    ? `<p class="note">Surat suara ${esc(E.nama)} tidak dibagikan di wilayah ini.</p>`
    : total > 0 ? listed.map(({ value, index }) => `
    <div class="bar">
      <div class="bn"><span class="dot" style="background:${O[index].warna}"></span><span>${esc(O[index].no)}. ${esc(O[index].pendek)}</span>${seatBadge(O[index])}</div>
      <div class="bv">${pct(value / total)}</div>
      <div class="btrack"><i class="bfill" style="width:${(value / total * 100).toFixed(2)}%;background:${O[index].warna}"></i></div>
      <div class="babs">${fmt(value)} suara</div>
    </div>`).join('') : '<p class="note">Tidak ada perolehan positif yang dapat dihitung menjadi persentase.</p>';
  const noun = E.jenis === 'calon' ? 'calon' : 'partai';
  const more = E.jenis !== 'paslon' && shown.length > 6
    ? `<button class="more" id="moreb">${showAll ? '↑ Ringkas' : `↓ Lihat seluruh ${shown.length} ${noun}`}</button>`
    : '';
  const tied = isTie(node);
  const winnerBlock = winner == null
    ? `<div class="winner" style="background:${tied ? TIE_COLOR : NO_DATA};color:#353230"><span class="wn">${tied ? 'Perolehan tertinggi seri' : 'Tidak ada pemenang yang dapat dihitung'}</span><span class="wp">${tied ? fmt(Math.max(...votes)) : '—'}</span></div>
       <div class="rmeta" style="margin-top:6px">${tied ? `${leadersOf(node).length} opsi memperoleh suara tertinggi yang sama.` : 'Perolehan hilang atau jumlah seluruh opsi nol.'}</div>`
    : `<div class="winner" style="background:${O[winner].warna}"><span class="wn">${esc(O[winner].no)}. ${esc(E.jenis === 'paslon' ? O[winner].pendek : O[winner].nama)}</span>
       <span class="wp">${pct(votes[winner] / total, 1)}</span></div>
       <div class="rmeta" style="margin-top:6px">Unggul ${pct(margin)} atas peringkat kedua</div>`;
  const seatMeta = E.jenis === 'calon' && shown.some(index => O[index].seat)
    ? '<div class="rmeta">Lencana <b>kursi indikatif</b> menandai empat besar tingkat provinsi, bukan penetapan KPU.</div>'
    : '';
  return {
    winner: winnerBlock + seatMeta,
    bars: `<div class="ph">Perolehan suara</div><div class="bars">${bars}</div>${more}`
  };
}
/* Nasional DPD: tidak ada pemenang nasional, jadi panel menerangkan sistemnya
   dan menampilkan calon dengan suara absolut terbanyak, masing-masing diukur
   terhadap pilihan sah provinsinya sendiri. */
function nationalCandidateBlocks(node, E) {
  const provinces = node.anak.filter(P => E.rosters.has(P.code));
  const leaders = [];
  for (const P of provinces) {
    const O = E.rosters.get(P.code), result = resultOf(P, E.id);
    const total = result && result.present ? result.votes.reduce((a, b) => a + b, 0) : 0;
    if (!(total > 0)) continue;
    for (const index of shownIndexes(O)) {
      const value = number(result.votes[index]);
      if (value > 0) leaders.push({ P, option: O[index], value, share: value / total });
    }
  }
  leaders.sort((a, b) => b.value - a.value);
  const top = leaders.slice(0, 10), max = top.length ? top[0].value : 0;
  const bars = top.length ? top.map(({ P, option, value, share }) => `
    <div class="bar">
      <div class="bn"><span class="dot" style="background:${option.warna}"></span><span>${esc(option.pendek)}</span>${seatBadge(option)}</div>
      <div class="bv">${fmt(value)}</div>
      <div class="btrack"><i class="bfill" style="width:${(value / max * 100).toFixed(2)}%;background:${option.warna}"></i></div>
      <div class="babs">${esc(P.name)} · nomor urut ${esc(option.no)} · ${pct(share)} pilihan sah provinsinya</div>
    </div>`).join('') : '<p class="note">Tidak ada perolehan positif yang dapat diurutkan.</p>';
  return {
    winner: `<div class="winner" style="background:${TOP_SHARE_COLOR}"><span class="wn">DPD dipilih per provinsi</span><span class="wp">${fmt(provinces.length)} × ${DPD_SEATS}</span></div>
       <div class="rmeta" style="margin-top:6px">${fmt(provinces.length)} daerah pemilihan dengan ${DPD_SEATS} kursi masing-masing. Calon hanya bersaing dengan calon lain di provinsinya, jadi tidak ada pemenang nasional; pilih provinsi untuk melihat seluruh calonnya.</div>`,
    bars: `<div class="ph">Suara terbanyak · 10 calon se-Indonesia</div><div class="bars">${bars}</div>`
  };
}
function statsSection(node, result, total) {
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
  return `<div class="psec">
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
    </div>`;
}
/* Daftar anak memakai roster wilayah anak itu sendiri; di tingkat nasional DPD
   setiap provinsi menyebut calon teratasnya dan titiknya mengikuti warna peta. */
function childSection(node, national) {
  const children = node.anak;
  if (!children.length) return '';
  const rows = children.map(child => ({ child, childTotal: sahOf(child), childWinner: winnerOf(child), childVotes: votesOf(child) }))
    .sort((a, b) => number(b.childTotal) - number(a.childTotal));
  return `<div class="psec"><div class="ph">${ANAK[node.lv]} (${children.length.toLocaleString('id-ID')}) · klik untuk memperdalam</div>
      <div class="childlist">${rows.map(({ child, childTotal, childWinner, childVotes }) => {
        if (childWinner == null) return `<button class="chi" data-k="${esc(child.key)}"><span class="dot" style="background:${isTie(child) ? TIE_COLOR : NO_DATA}"></span>
          <span class="cnm">${esc(child.name)}</span><span class="cvp">${isTie(child) ? 'Seri' : '—'}</span></button>`;
        const option = opsiFor(child)[childWinner];
        const label = national ? `${esc(child.name)} <span class="cand">· ${esc(option.pendek)}</span>` : esc(child.name);
        return `<button class="chi" data-k="${esc(child.key)}"><span class="dot" style="background:${national ? colorOf(child) : option.warna}"></span>
          <span class="cnm">${label}</span><span class="cvp">${pct(childVotes[childWinner] / childTotal, 0)}</span></button>`;
      }).join('')}</div></div>`;
}
/* Warna teks yang terbaca di atas segmen berwarna hex. */
function inkOn(hex) {
  const value = parseInt(String(hex).slice(1, 7), 16);
  if (!Number.isFinite(value)) return '#fff';
  const r = value >> 16 & 255, g = value >> 8 & 255, b = value & 255;
  return (.299 * r + .587 * g + .114 * b) / 255 > .62 ? '#201e1d' : '#fff';
}
const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
const WINS_OTHER = '#b9b4b1';
/* Berapa unit peta yang dimenangkan setiap opsi. Unitnya mengikuti peta: desa
   di mode Batas Desa, wilayah anak di mode berjenjang, sehingga angka ini selalu
   menjelaskan warna yang sedang tampak. Baris opsi adalah tombol sorot. */
function winsSection(node) {
  if (topShareView()) return '';
  const units = activeUnits();
  if (units.length < 2) return '';
  const E = election(), O = opsi(), total = units.length, noun = unitNoun(units);
  const counts = new Map();
  let ties = 0, empty = 0;
  for (const unit of units) {
    const winner = winnerOf(unit);
    if (winner != null) counts.set(winner, (counts.get(winner) || 0) + 1);
    else if (isTie(unit)) ties += 1;
    else empty += 1;
  }
  if (!counts.size) return '';
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const rest = ranked.slice(6).reduce((sum, [, count]) => sum + count, 0);
  const segments = [
    ...ranked.slice(0, 6).map(([index, count]) => ({ warna: O[index].warna, count, label: `${O[index].no}. ${O[index].pendek}`, opsi: index })),
    ...(rest ? [{ warna: WINS_OTHER, count: rest, label: `${ranked.length - 6} ${E.jenis === 'calon' ? 'calon' : 'partai'} lainnya` }] : []),
    ...(ties ? [{ warna: TIE_COLOR, count: ties, label: 'Seri' }] : []),
    ...(empty ? [{ warna: NO_DATA, count: empty, label: 'Tanpa perolehan' }] : [])
  ];
  const bar = segments.map(segment => `<i style="flex:${segment.count};background:${segment.warna};color:${inkOn(segment.warna)}"
    title="${esc(segment.label)} · ${fmt(segment.count)} ${esc(noun)}">${segment.count / total >= .08 ? pct(segment.count / total, 0) : ''}</i>`).join('');
  const rows = segments.map(segment => {
    const inner = `<span class="dot" style="background:${segment.warna}"></span><span class="wl">${esc(segment.label)}</span>
      <span class="wc">${fmt(segment.count)}</span><span class="wp">${pct(segment.count / total)}</span>`;
    return segment.opsi != null
      ? `<button class="wrow" data-o="${segment.opsi}" aria-pressed="${S.sorot === segment.opsi}" title="Sorot ${esc(noun)} yang dimenangkan ${esc(segment.label)}">${inner}</button>`
      : `<div class="wrow">${inner}</div>`;
  }).join('');
  // Porsi wilayah yang dimenangkan jarang sama dengan porsi suara; kalimat ini
  // menjajarkan keduanya untuk pemenang wilayah terpilih.
  const leader = winnerOf(node), sah = sahOf(node), won = counts.get(leader) || 0;
  const insight = leader != null && sah > 0
    ? `<b>${esc(O[leader].no)} ${esc(O[leader].pendek)}</b> unggul di ${fmt(won)} dari ${fmt(total)} ${esc(noun)} (${pct(won / total)}) dengan ${pct(votesOf(node)[leader] / sah)} pilihan sah. `
    : '';
  const drawn = desaFill(node);
  const missing = drawn ? units.filter(unit => !geoKeys(drawn).has(unit.key)).length : 0;
  const polygonNote = missing
    ? `<div class="banner" style="margin-top:10px"><span>⚑</span><span><b>${fmt(missing)} desa belum memiliki poligon batas</b> sehingga tidak tergambar di peta; hasilnya tetap dihitung di sini serta tercantum di tabel dan CSV.</span></div>`
    : '';
  return `<div class="psec">
      <div class="ph">${esc(capital(noun))} dimenangkan · ${fmt(total)} ${esc(noun)}</div>
      <div class="wins">${bar}</div>
      <div class="wrows">${rows}</div>
      <div class="rmeta" style="margin-top:8px">${insight}Klik baris untuk menyorot di peta.</div>
      ${polygonNote}
    </div>`;
}
function renderPanel() {
  const node = S.sel, E = election(), result = resultOf(node);
  const votes = result ? result.votes : [], total = result && result.present ? votes.reduce((a, b) => a + b, 0) : null;
  const national = topShareView();
  const blocks = national ? nationalCandidateBlocks(node, E) : choiceBlocks(node, E, votes, total);
  $('#panel').innerHTML = `
    <div class="psec">
      <div class="ph">${LEVELS[node.lv]}${node.code !== '0' ? ' · kode ' + esc(node.code) : ''}</div>
      <h2 class="rtitle">${esc(node.name)}</h2><div class="rmeta">${esc(crumbText(node))}</div>
      ${blocks.winner}
    </div>
    <div class="psec">${blocks.bars}</div>
    ${winsSection(node)}
    ${statsSection(node, result, total)}
    <div class="psec">${coverageNote(node, result, total || 0)}</div>
    ${childSection(node, national)}`;
  const more = $('#moreb');
  if (more) more.onclick = () => { showAll = !showAll; renderPanel(); };
  $('#panel').querySelectorAll('.chi[data-k]').forEach(element => {
    element.onclick = () => select(S.nodes.get(element.dataset.k));
  });
  $('#panel').querySelectorAll('.wrow[data-o]').forEach(element => {
    element.onclick = () => setSorot(+element.dataset.o);
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
/* Baris tabel dan CSV: seluruh desa pada mode Batas Desa, selain itu anak
   wilayah. Kolom induk menjaga desa bernama sama tetap dapat dibedakan. */
const TABLE_LIMIT = 200;
function tableUnits() { return desaView() ? leavesOf(S.sel) : S.sel.anak; }
function parentColumns() {
  if (!desaView()) return [];
  return S.sel.lv === 1
    ? [['Kab/Kota', 'kabupaten_kota', 2], ['Kecamatan', 'kecamatan', 3]]
    : [['Kecamatan', 'kecamatan', 3]];
}
function renderTable() {
  const node = S.sel, O = opsi(), children = tableUnits(), table = $('#dtable');
  const desa = desaView(), parents = parentColumns();
  const toggle = $('#ttoggle');
  if (toggle) toggle.textContent = desa ? `Tabel desa · ${fmt(children.length)}` : 'Tabel rincian';
  if (!children.length) {
    table.innerHTML = `<tbody><tr><td style="padding:14px">Tidak ada rincian wilayah di bawah ${esc(node.name)}.</td></tr></tbody>`;
    return;
  }
  // Nasional DPD tidak punya kolom calon bersama: setiap provinsi diringkas
  // menjadi calon teratasnya sendiri.
  const national = topShareView();
  const indexes = national ? [] : shownIndexes(O);
  const sortKey = S.sort.k === 'n' || S.sort.k === 'v' || (S.sort.k === 't' && national)
    || (typeof S.sort.k === 'number' && indexes.includes(S.sort.k)) ? S.sort.k : 'v';
  const rows = children.map(child => ({ child, votes: votesOf(child), total: sahOf(child), result: resultOf(child) }));
  rows.sort((a, b) => S.sort.d * (sortKey === 'n'
    ? a.child.name.localeCompare(b.child.name, 'id')
    : sortKey === 'v' ? number(a.total) - number(b.total)
      : sortKey === 't' ? number(topShareOf(a.child)) - number(topShareOf(b.child))
        : (a.total > 0 ? a.votes[sortKey] / a.total : -1) - (b.total > 0 ? b.votes[sortKey] / b.total : -1)));
  const optionHeaders = national
    ? '<th>Calon teratas</th><th data-s="t" style="text-align:right">Porsi calon teratas</th>'
    : indexes.map(index => `<th data-s="${index}" style="text-align:right">${esc(O[index].no)} ${esc(O[index].pendek)}</th>`).join('') + '<th>Pemenang</th>';
  const limit = S.tableAll ? rows.length : TABLE_LIMIT;
  const columnCount = 5 + parents.length + (national ? 2 : indexes.length + 1);
  const moreRow = rows.length > limit
    ? `<tr><td colspan="${columnCount}"><button class="more" id="tmore">↓ Tampilkan semua ${fmt(rows.length)} ${desa ? 'desa' : 'wilayah'} (kini ${fmt(limit)})</button></td></tr>`
    : '';
  table.innerHTML = `<thead><tr><th data-s="n">${desa ? ANAK[3] : ANAK[node.lv]}</th>${parents.map(([label]) => `<th>${label}</th>`).join('')}
      <th data-s="v" style="text-align:right">Pilihan sah (Σ opsi)</th>
      <th style="text-align:right">Partisipasi valid</th>
      <th style="text-align:right">TPS kosong</th>
      <th style="text-align:right">TPS suara ekstrem</th>
      ${optionHeaders}</tr></thead>
    <tbody>${rows.slice(0, limit).map(({ child, votes, total, result }) => {
      const winner = winnerOf(child), turnout = turnoutOf(child), childOptions = opsiFor(child);
      const winnerCell = winner == null
        ? '<span class="dot" style="display:inline-block;background:' + (isTie(child) ? TIE_COLOR : NO_DATA) + '"></span> ' + (isTie(child) ? 'Seri' : 'Tidak ada data')
        : `<span class="dot" style="display:inline-block;background:${national ? colorOf(child) : childOptions[winner].warna}"></span> ${esc(national ? childOptions[winner].nama : childOptions[winner].pendek)}`;
      const optionCells = national
        ? `<td>${winnerCell}</td><td style="text-align:right">${pct(topShareOf(child), 1)}</td>`
        : indexes.map(index => `<td style="text-align:right">${total > 0 ? pct(votes[index] / total, 1) : '—'}</td>`).join('') + `<td>${winnerCell}</td>`;
      const parentCells = parents.map(([, , level]) => `<td>${esc(ancestorAt(child, level).name)}</td>`).join('');
      return `<tr><td class="nm" data-k="${esc(child.key)}">${esc(child.name)}</td>${parentCells}<td style="text-align:right">${fmt(total)}</td>
        <td style="text-align:right">${pct(turnout, 1)}</td>
        <td style="text-align:right">${fmt(statOf(result, 'blank-tps'))}</td>
        <td style="text-align:right">${fmt(statOf(result, 'outlier-vote-tps'))}</td>
        ${optionCells}</tr>`;
    }).join('')}${moreRow}</tbody>`;
  const more = $('#tmore');
  if (more) more.onclick = () => { S.tableAll = true; renderTable(); };
  table.querySelectorAll('th[data-s]').forEach(header => {
    header.onclick = () => {
      const key = ['n', 'v', 't'].includes(header.dataset.s) ? header.dataset.s : +header.dataset.s;
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
  const node = S.sel, E = election(), children = tableUnits(), desa = desaView(), parents = parentColumns();
  if (!children.length) return;
  // Kolom calon DPD hanya bermakna dalam satu provinsi: di tingkat nasional
  // setiap provinsi diekspor bersama calon teratasnya, di bawahnya tajuk kolom
  // memuat nama calon dari roster provinsi.
  const national = topShareView(), O = opsi();
  const indexes = national ? [] : shownIndexes(O);
  const optionHead = national
    ? ['calon_teratas_no', 'calon_teratas_nama', 'calon_teratas_suara', 'calon_teratas_porsi']
    : indexes.map(index => E.jenis === 'calon' ? `${E.voteColumns[index]} ${O[index].nama}` : E.voteColumns[index]);
  const head = ['kode_wilayah', 'wilayah', ...parents.map(([, column]) => column), 'tingkat', 'rekaman_tersedia', 'pilihan_sah_jumlah_opsi',
    ...S.statNames, ...optionHead];
  const lines = [head.map(csvCell).join(',')];
  for (const child of children) {
    const result = resultOf(child), present = !!(result && result.present);
    const total = present ? result.votes.reduce((a, b) => a + b, 0) : null;
    let optionCells;
    if (national) {
      const winner = winnerOf(child), option = winner == null ? null : opsiFor(child)[winner];
      optionCells = option
        ? [option.no, option.nama, result.votes[winner], (result.votes[winner] / total).toFixed(6)]
        : [null, null, null, null];
    } else {
      optionCells = indexes.map(index => present ? result.votes[index] : null);
    }
    const row = [child.key, child.name, ...parents.map(([, , level]) => ancestorAt(child, level).name),
      desa ? ANAK[3] : ANAK[node.lv], present ? 1 : 0, total,
      ...S.statNames.map(name => statOf(result, name)), ...optionCells];
    lines.push(row.map(csvCell).join(','));
  }
  downloadBlob(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    `pemilu${S.D.id}-${S.pemilu}-${fileSlug(node)}${desa ? '-desa' : ''}.csv`);
}
function fileSlug(node) {
  return node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || node.key.toLowerCase();
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ── ekspor PNG siap-laporan ─────────────────────────────────────── */
/* Gambar yang berdiri sendiri untuk slide atau laporan: judul, keterangan
   warna, peta seperti yang tampak (termasuk zoom dan sorot), legenda, dan
   catatan sumber, dengan tata huruf halaman yang sama. */
function mapDescription() {
  const noun = unitNoun(), line = legendModel().line, O = opsi();
  const color = S.mode === 'turnout' ? 'warna = partisipasi tervalidasi'
    : topShareView() ? 'warna = porsi calon teratas di provinsinya'
      : S.mode === 'share' ? `warna = perolehan ${O[S.fokus] ? O[S.fokus].pendek : ''}`
        : S.mode === 'winner' ? `warna = pemenang per ${noun}` : `warna = pemenang per ${noun}, intensitas = margin`;
  const sorot = S.sorot != null && O[S.sorot] ? `disorot: ${O[S.sorot].no} ${O[S.sorot].pendek}` : null;
  return [`${fmt(activeUnits().length)} ${noun}`, color, line ? `garis tegas = ${line.toLowerCase()}` : null, sorot]
    .filter(Boolean).join(' · ');
}
function wrapLines(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
function alpha(hex, opacity) {
  const value = parseInt(String(hex).slice(1, 7), 16);
  return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${opacity})`;
}
/* Satu fungsi untuk mengukur (draw=false) dan menggambar (draw=true), supaya
   tinggi kanvas selalu sama dengan isi yang benar-benar tergambar. */
function paintReport(ctx, image, layout, draw) {
  const { W, pad, width, height, ink, surface } = layout;
  const innerW = W - pad * 2, muted = alpha(ink, .56), rule = alpha(ink, .4);
  const setFont = (weight, size) => { ctx.font = `${weight} ${size}px Archivo, system-ui, sans-serif`; };
  const put = (text, x, y, weight, size, color) => {
    setFont(weight, size);
    if (draw) { ctx.fillStyle = color; ctx.fillText(text, x, y); }
    return ctx.measureText(text).width;
  };
  const box = (x, y, w, h, color) => { if (draw) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); } };
  ctx.textBaseline = 'top';
  const node = S.sel, model = legendModel();
  let y = pad;
  put(`PEMILU ${S.D.id} · ${CONTEST_NAMES[S.pemilu][1].toUpperCase()} · ${LEVELS[node.lv].toUpperCase()}`, pad, y, 600, 11, muted);
  y += 20;
  put(node.name, pad, y, 800, 30, ink);
  y += 40;
  setFont(400, 13);
  for (const line of wrapLines(ctx, mapDescription(), innerW)) { put(line, pad, y, 400, 13, alpha(ink, .72)); y += 19; }
  y += 10;
  box(pad, y, innerW, 2, ink);
  y += 2;
  box(pad, y, innerW, height, surface);
  if (draw) ctx.drawImage(image, pad + (innerW - width) / 2, y, width, height);
  y += height;
  box(pad, y, innerW, 1, rule);
  y += 14;
  put(model.title.toUpperCase(), pad, y, 600, 10, muted);
  y += 18;
  let x = pad;
  const fit = w => { if (x > pad && x + w > pad + innerW) { x = pad; y += 20; } };
  setFont(400, 12);
  if (model.ramp) {
    const lo = ctx.measureText(model.ramp.lo).width, hi = ctx.measureText(model.ramp.hi).width;
    fit(lo + hi + 138);
    put(model.ramp.lo, x, y, 400, 12, ink);
    x += lo + 6;
    model.ramp.colors.forEach((color, index) => box(x + index * 14, y + 1, 14, 11, color));
    x += 132;
    put(model.ramp.hi, x, y, 400, 12, ink);
    x += hi + 18;
  }
  for (const item of model.items) {
    const picked = item.opsi != null && item.opsi === S.sorot;
    setFont(picked ? 700 : 400, 12);
    const w = 18 + ctx.measureText(item.label).width;
    fit(w);
    box(x, y + 1, 12, 12, S.sorot != null && item.opsi != null && !picked ? alpha(item.warna, .3) : item.warna);
    put(item.label, x + 18, y, picked ? 700 : 400, 12, ink);
    x += w + 16;
  }
  if (model.line) {
    setFont(400, 12);
    const w = 24 + ctx.measureText(model.line).width;
    fit(w);
    box(x, y + 6, 18, 2, ink);
    put(model.line, x + 24, y, 400, 12, ink);
  }
  y += 30;
  box(pad, y, innerW, 1, rule);
  y += 10;
  setFont(400, 10.5);
  const source = `Sumber: ${$('#srcnote').textContent}`;
  for (const line of wrapLines(ctx, source, innerW)) { put(line, pad, y, 400, 10.5, muted); y += 15; }
  return y + pad - 6;
}
async function exportPNG() {
  if (!S.hasGeoView || typeof XMLSerializer === 'undefined') return;
  const button = $('#tpng'), label = button.textContent;
  button.disabled = true;
  button.textContent = 'Menyiapkan PNG…';
  try {
    const source = $('#map'), [width, height] = dims, scale = 2;
    const style = getComputedStyle(document.documentElement);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    const layout = {
      W: Math.max(width, 720) + 64, pad: 32, width, height,
      bg: token('--color-bg', '#f3f2f2'), ink: token('--color-text', '#201e1d'), surface: token('--color-surface', '#eae9e9')
    };
    // Kelas CSS tidak ikut ke gambar SVG mandiri, jadi gaya garis ditanam
    // sebagai atribut. Garis non-scaling diukur dalam piksel gambar 2x.
    const clone = source.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', width * scale);
    clone.setAttribute('height', height * scale);
    const dense = source.classList.contains('dense');
    clone.querySelectorAll('path.region').forEach(region => {
      const selected = region.classList.contains('sel');
      region.setAttribute('stroke', selected ? layout.ink : layout.bg);
      region.setAttribute('stroke-width', (selected ? 1.6 : dense ? .25 : .6) * scale);
      region.setAttribute('stroke-linejoin', 'round');
      region.setAttribute('vector-effect', 'non-scaling-stroke');
      if (region.classList.contains('dim')) region.setAttribute('opacity', .22);
    });
    clone.querySelectorAll('path.bound').forEach(bound => {
      bound.setAttribute('fill', 'none');
      bound.setAttribute('stroke', layout.ink);
      bound.setAttribute('stroke-width', 1.2 * scale);
      bound.setAttribute('stroke-linejoin', 'round');
      bound.setAttribute('vector-effect', 'non-scaling-stroke');
    });
    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('SVG peta gagal dirender'));
        image.src = svgUrl;
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const total = paintReport(document.createElement('canvas').getContext('2d'), image, layout, false);
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.width = layout.W * scale;
    canvas.height = Math.ceil(total * scale);
    ctx.scale(scale, scale);
    ctx.fillStyle = layout.bg;
    ctx.fillRect(0, 0, layout.W, total);
    paintReport(ctx, image, layout, true);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('kanvas tidak menghasilkan PNG');
    downloadBlob(blob, `pemilu${S.D.id}-${S.pemilu}-${fileSlug(S.sel)}${desaView() ? '-desa' : ''}.png`);
  } catch (error) {
    console.error('Ekspor PNG gagal', error);
    alert(`Ekspor PNG gagal: ${error.message}`);
  } finally {
    button.textContent = label;
    button.disabled = !S.hasGeoView;
  }
}

/* ── tautan yang dapat dibagikan ─────────────────────────────────── */
/* #<tahun>/<kontes>/<kode wilayah>?warna=…&batas=desa&fokus=<nomor urut>.
   Hash ditulis ulang dengan replaceState setiap render, jadi bilah alamat
   selalu memuat tampilan yang sedang dilihat tanpa memenuhi riwayat. */
const WARNA = { winner: 'pemenang', margin: 'margin', share: 'perolehan', turnout: 'partisipasi' };
function stateHash() {
  if (!S.sel || !S.tahun || !S.pemilu) return '';
  const parts = [S.tahun, S.pemilu];
  if (S.sel !== S.root) parts.push(S.sel.key);
  const params = [];
  if (S.mode !== 'margin') params.push(`warna=${WARNA[S.mode]}`);
  if (S.batas === 'desa') params.push('batas=desa');
  const option = opsi()[S.fokus];
  if (S.mode === 'share' && option && !topShareView()) params.push(`fokus=${encodeURIComponent(option.no)}`);
  return '#' + parts.map(encodeURIComponent).join('/') + (params.length ? '?' + params.join('&') : '');
}
function parseHash(hash) {
  const text = String(hash || '').replace(/^#\/?/, '');
  if (!text) return null;
  try {
    const [route, query = ''] = text.split('?');
    const [tahun, pemilu, key] = route.split('/').map(part => decodeURIComponent(part || ''));
    const params = new URLSearchParams(query);
    return { tahun, pemilu, key, warna: params.get('warna'), batas: params.get('batas'), fokus: params.get('fokus') };
  } catch (error) {
    return null;
  }
}
/* Menerapkan tautan ke bundel tahun yang sudah aktif. Bagian yang tidak
   dikenal (kontes tanpa data, kode wilayah lama) diabaikan diam-diam. */
function applyLinked(linked) {
  const mode = Object.keys(WARNA).find(key => WARNA[key] === linked.warna);
  if (mode) S.mode = mode;
  if (linked.batas === 'desa' || linked.batas === 'berjenjang') S.batas = linked.batas;
  if (linked.pemilu && S.contestsById.has(linked.pemilu)) S.pemilu = linked.pemilu;
  if (linked.key && S.nodes.has(linked.key)) S.sel = S.nodes.get(linked.key);
  else if (!linked.key) S.sel = S.root;
  if (linked.fokus != null) {
    const index = opsiFor(S.sel).findIndex(option => option.no === linked.fokus && !option.absent);
    if (index >= 0) S.fokus = index;
  }
  S.sorot = null;
}
function writeHash() {
  if (typeof history === 'undefined' || !history.replaceState || typeof location === 'undefined') return;
  const hash = stateHash();
  if (hash && location.hash !== hash) history.replaceState(null, '', location.pathname + hash);
}
async function copyLink() {
  writeHash();
  const button = $('#tlink'), url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Tautan tersalin';
  } catch (error) {
    // Konteks tanpa izin clipboard: tampilkan tautan agar bisa disalin manual.
    window.prompt('Salin tautan tampilan ini:', url);
  }
  setTimeout(() => { button.textContent = 'Salin tautan'; }, 1600);
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
  // Roster DPD berganti per provinsi, jadi sorot calon tidak berlaku lintas provinsi.
  const E = election();
  if (E && E.jenis === 'calon' && provinceOf(node) !== provinceOf(S.sel)) S.sorot = null;
  S.sel = node;
  showAll = false;
  S.tableAll = false;
  await prepareSelection(node);
  if (version !== selectVersion) return;
  await renderAll();
}
function viewInfo() {
  if (!S.hasGeoView) return 'Grid wilayah · GeoJSON tidak tersedia';
  if (desaView()) return `Peta per desa · ${fmt(activeUnits().length)} desa · ${S.D.geoNote}`;
  if (S.batas === 'desa' && S.sel.lv === 0) return 'Batas desa tersedia setelah memilih provinsi';
  if (wantsDesa(S.sel)) return 'Batas desa gagal dimuat · memakai batas berjenjang';
  return `Peta geografis · ${S.D.geoNote}`;
}
async function renderAll() {
  renderCrumbs();
  renderModes();
  renderBatas();
  updateScale();
  renderLegend();
  S.hasGeoView = await drawGeo();
  $('#map').style.display = S.hasGeoView ? '' : 'none';
  $('#zoombtns').style.display = S.hasGeoView ? '' : 'none';
  $('#gridwrap').hidden = S.hasGeoView;
  if (!S.hasGeoView) renderGrid();
  $('#viewinfo').textContent = viewInfo();
  const png = $('#tpng');
  if (png) png.disabled = !S.hasGeoView;
  renderLocator();
  renderPanel();
  renderTable();
  updateSourceNote();
  writeHash();
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
async function selectYear(id, initial = false, linked = null) {
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
  S.sorot = null;
  S.sel = names.length ? nodeByNames(names) : S.root;
  if (linked) applyLinked(linked);
  document.title = `Peta Hasil Pemilu Indonesia ${dataset.id}`;
  renderYears();
  renderTabs();
  await select(S.sel);
  const box = $('#loading');
  if (box) box.remove();
}

async function boot() {
  // Hash tautan lebih diutamakan daripada ?tahun= yang lebih lama.
  const linked = parseHash(location.hash);
  const requested = (linked && linked.tahun) || new URLSearchParams(location.search).get('tahun');
  const startId = DATASETS.some(dataset => dataset.id === requested) ? requested : DEFAULT_YEAR;
  try {
    initMap();
    await selectYear(startId, true, linked);
  } catch (error) {
    console.error(error);
    loadingBox('Gagal memuat data: ' + error.message);
  }

  $('#q').addEventListener('input', event => search(event.target.value));
  $('#q').addEventListener('blur', () => setTimeout(() => { $('#qr').hidden = true; }, 180));
  $('#ttoggle').onclick = () => $('#tablewrap').classList.toggle('open');
  $('#tcsv').onclick = exportCSV;
  $('#tpng').onclick = exportPNG;
  $('#tlink').onclick = copyLink;
  addEventListener('resize', () => { if (S.sel) renderAll(); });
  // Tautan yang ditempel ke tab yang sama; tulisan replaceState sendiri tidak
  // memicu hashchange, jadi tidak ada putaran.
  addEventListener('hashchange', () => {
    const linked = parseHash(location.hash);
    if (!linked || location.hash === stateHash()) return;
    if (linked.tahun && linked.tahun !== S.tahun && DATASETS.some(dataset => dataset.id === linked.tahun)) {
      selectYear(linked.tahun, false, linked);
      return;
    }
    applyLinked(linked);
    renderTabs();
    select(S.sel);
  });
  addEventListener('keydown', event => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;
    if ((event.key === 'Escape' || event.key === 'Backspace') && S.sel && S.sel.parent) { event.preventDefault(); select(S.sel.parent); }
    if (event.key === '/') { event.preventDefault(); $('#q').focus(); }
    if ((event.key === 'd' || event.key === 'D') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setBatas(S.batas === 'desa' ? 'berjenjang' : 'desa');
      return;
    }
    if (event.key === 't' || event.key === 'T') {
      const order = DATASETS.map(dataset => dataset.id);
      const next = order[(order.indexOf(S.tahun) + 1) % order.length];
      event.preventDefault();
      selectYear(next);
      return;
    }
    const index = ['1', '2', '3', '4', '5'].indexOf(event.key);
    const tabs = document.querySelectorAll('.tab');
    if (index >= 0 && tabs[index]) tabs[index].click();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PARTY_SPEC, PARTY_SPEC_2024, PASLON_2019, PASLON_2024, DATASETS, CONTEST_ORDER,
    CONTEST_NAMES, S, normalizeContests, buildTree, installElectionData,
    parseEntry, combineResults, resultOf, leadersOf, winnerOf, isTie, marginOf, featureNode, columnKey,
    selectYear, select, nodeByNames, opsiFor, shownIndexes, candidateShortName, DPD_SEATS,
    setBatas, setSorot, desaView, leavesOf, activeUnits, stateHash, parseHash
  };
}
if (typeof document !== 'undefined') boot();
