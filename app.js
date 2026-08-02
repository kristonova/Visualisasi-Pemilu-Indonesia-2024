/* Peta Hasil Pemilu Indonesia 2024 — penjelajah berjenjang
   Struktur wilayah & angka basis 2019 berasal dari hasil scraping KPU milik pengguna
   (src/dataprov-kec.csv + src/pilpres/*.csv, diagregasi ke data/wilayah.json).
   Angka 2024 adalah DATA CONTOH deterministik — ganti loader di buildElection() saat CSV 2024 siap. */

/* ── util ─────────────────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const fmt = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('id-ID');
const pct = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';
function fnv(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const norm = s => s.toUpperCase()
  .replace(/DAERAH ISTIMEWA|DAERAH KHUSUS IBUKOTA|PROVINSI|^DKI |^DI /g, ' ')
  .replace(/[^A-Z]+/g, ' ').trim();

/* ── definisi pemilu ──────────────────────────────────────────────── */
/* OKLCH → hex (d3 tidak bisa membaca notasi oklch) */
function OKL(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b2 = C * Math.sin(h);
  const l_ = L + .3963377774 * a + .2158037573 * b2, m_ = L - .1055613458 * a - .0638541728 * b2, s_ = L - .0894841775 * a - 1.2914855480 * b2;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s;
  const bb = -.0041960863 * l - .7034186147 * m + 1.7076147010 * s;
  const f = x => { x = x <= .0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - .055; return Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0'); };
  return '#' + f(r) + f(g) + f(bb);
}

const PASLON = [
  { no: '01', nama: 'Ir. H. Joko Widodo – Prof. Dr. (H.C.) K.H. Ma\'ruf Amin', pendek: 'Jokowi–Ma\'ruf', warna: '#e02424', anchor: 0.555 },
  { no: '02', nama: 'H. Prabowo Subianto – Sandiaga Salahuddin Uno', pendek: 'Prabowo–Sandi', warna: '#1d70b8', anchor: 0.445 }
];

const PARTAI = [
  ['1', 'PKB', 'Partai Kebangkitan Bangsa', 9.69, 155],
  ['2', 'Gerindra', 'Partai Gerindra', 12.57, 60],
  ['3', 'PDI-P', 'PDI Perjuangan', 19.33, 25],
  ['4', 'Golkar', 'Partai Golkar', 12.31, 90],
  ['5', 'NasDem', 'Partai NasDem', 9.05, 245],
  ['6', 'Garuda', 'Partai Garuda', 0.50, 265],
  ['7', 'Berkarya', 'Partai Berkarya', 2.09, 215],
  ['8', 'PKS', 'Partai Keadilan Sejahtera', 8.21, 130],
  ['9', 'Perindo', 'Partai Perindo', 2.67, 45],
  ['10', 'PPP', 'Partai Persatuan Pembangunan', 4.52, 330],
  ['11', 'PSI', 'Partai Solidaritas Indonesia', 1.89, 8],
  ['12', 'PAN', 'Partai Amanat Nasional', 6.84, 195],
  ['13', 'Hanura', 'Partai Hanura', 1.54, 305],
  ['14', 'Demokrat', 'Partai Demokrat', 7.77, 275],
  ['19', 'PBB', 'Partai Bulan Bintang', 0.79, 350],
  ['20', 'PKPI', 'Partai Keadilan dan Persatuan Indonesia', 0.22, 110],
  ['15', 'PA', 'Partai Aceh (Lokal)', 0.10, 10],
  ['16', 'SIRA', 'Partai SIRA (Lokal)', 0.05, 20],
  ['17', 'PDA', 'Partai Daerah Aceh (Lokal)', 0.05, 30],
  ['18', 'PNA', 'Partai Nanggroe Aceh (Lokal)', 0.05, 40]
].map(([no, p, n, a, h]) => ({
  no, pendek: p, nama: n, anchor: a / 100,
  warna: a >= 2.5 ? OKL(.585, .175, h) : OKL(.665, .095, h)
}));

const DPD_N = 12;
const DPD = Array.from({ length: DPD_N }, (_, i) => ({
  no: String(i + 1), pendek: 'Calon ' + (i + 1), nama: 'Calon DPD nomor urut ' + (i + 1),
  anchor: [.16, .13, .11, .095, .085, .075, .065, .058, .05, .045, .04, .035][i],
  warna: OKL(.42 + (i % 3) * .09, .13, (i * 53 + 20) % 360)
}));

const PEMILU = [
  { id: 'pilpres', kicker: 'Pemilu Presiden 2019', nama: 'Presiden 2019', opsi: PASLON, jenis: 'paslon', spread: 0 },
  { id: 'dpr', kicker: 'Pemilihan Legislatif 2019', nama: 'DPR RI 2019', opsi: PARTAI, jenis: 'partai', spread: .85 },
  { id: 'dprdprov', kicker: 'Pemilihan Legislatif 2019', nama: 'DPRD Provinsi', opsi: PARTAI, jenis: 'partai', spread: 1.0 },
  { id: 'dprdkab', kicker: 'Pemilihan Legislatif 2019', nama: 'DPRD Kab/Kota', opsi: PARTAI, jenis: 'partai', spread: 1.15 },
  { id: 'dpd', kicker: 'Dewan Perwakilan Daerah 2019', nama: 'DPD 2019', opsi: DPD, jenis: 'dpd', spread: .9 }
];

const LEVELS = ['Nasional', 'Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Kelurahan/Desa'];
const ANAK = ['Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Kelurahan/Desa', ''];

/* peta nama provinsi KPU → folder atlas TopoJSON */
const ATLAS = {
  'ACEH': 'Aceh', 'SUMATERA UTARA': 'Sumatera Utara', 'SUMATERA BARAT': 'Sumatera Barat',
  'RIAU': 'Riau', 'JAMBI': 'Jambi', 'SUMATERA SELATAN': 'Sumatera Selatan', 'BENGKULU': 'Bengkulu',
  'LAMPUNG': 'Lampung', 'KEPULAUAN BANGKA BELITUNG': 'Kepulauan Bangka Belitung',
  'KEPULAUAN RIAU': 'Kepulauan Riau', 'DKI JAKARTA': 'Jakarta', 'JAWA BARAT': 'Jawa Barat',
  'JAWA TENGAH': 'Jawa Tengah', 'DAERAH ISTIMEWA YOGYAKARTA': 'Yogyakarta', 'JAWA TIMUR': 'Jawa Timur',
  'BANTEN': 'Banten', 'BALI': 'Bali', 'NUSA TENGGARA BARAT': 'Nusa Tenggara Barat',
  'NUSA TENGGARA TIMUR': 'Nusa Tenggara Timur', 'KALIMANTAN BARAT': 'Kalimantan Barat',
  'KALIMANTAN TENGAH': 'Kalimantan Tengah', 'KALIMANTAN SELATAN': 'Kalimantan Selatan',
  'KALIMANTAN TIMUR': 'Kalimantan Timur', 'KALIMANTAN UTARA': 'Kalimantan Utara',
  'SULAWESI UTARA': 'Sulawesi Utara', 'SULAWESI TENGAH': 'Sulawesi Tengah',
  'SULAWESI SELATAN': 'Sulawesi Selatan', 'SULAWESI TENGGARA': 'Sulawesi Tenggara',
  'GORONTALO': 'Gorontalo', 'SULAWESI BARAT': 'Sulawesi Barat', 'MALUKU': 'Maluku',
  'MALUKU UTARA': 'Maluku Utara', 'PAPUA': 'Papua', 'PAPUA BARAT': 'Papua Barat'
};
const GH = 'https://cdn.jsdelivr.net/gh/ghapsara/indonesia-atlas@master/';
const slug = s => s.toLowerCase().replace(/\s+/g, '-');

/* ── state ────────────────────────────────────────────────────────── */
const S = {
  pemilu: 'pilpres', mode: 'margin', fokus: 1, sel: null, root: null,
  nodes: new Map(), index: [], res: {}, geoProv: null, geoKab: {}, sort: { k: 'v', d: -1 }
};

/* ── bangun pohon wilayah ─────────────────────────────────────────── */
function buildTree(raw) {
  const root = { lv: 0, key: 'ID', name: 'INDONESIA', code: '0', anak: [], parent: null };
  for (const p of raw.prov) {
    const P = { lv: 1, key: 'P' + p.k, name: p.n.replace(/^\+\s*/, '').toUpperCase(), code: p.k, anak: [], parent: root };
    for (const k of p.kab) {
      const K = { lv: 2, key: P.key + '.' + k.k, name: k.n, code: k.k, anak: [], parent: P };      for (const c of k.kec) {
        const C = { lv: 3, key: K.key + '.' + c.k, name: c.n, code: c.k, anak: [], parent: K, real: !!c.kel };
        if (c.kel) {
          c.kel.forEach((l, i) => {
            const d = l.d;
            C.anak.push({
              lv: 4, key: C.key + '.' + i, name: l.n, code: '—', anak: [], parent: C, real: true,
              base: { dpt: d[2], guna: d[3], sah: d[4], tsah: d[5], tps: d[6], p19: d[1], j19: d[0] }
            });
          });
        }
        K.anak.push(C);
      }
      P.anak.push(K);
    }
    root.anak.push(P);
  }
  // basis per kecamatan: agregat asli bila ada, selain itu imputasi berjenjang
  const walk = n => { S.nodes.set(n.key, n); n.anak.forEach(walk); };
  walk(root);
  const kecs = [...S.nodes.values()].filter(n => n.lv === 3);
  for (const n of kecs) {
    if (!n.anak.length) continue;
    const b = { dpt: 0, guna: 0, sah: 0, tsah: 0, tps: 0, p19: 0, j19: 0 };
    for (const k of n.anak) for (const f in b) b[f] += k.base[f];
    n.base = b;
  }
  /* rata-rata nyata per kabupaten & provinsi — dipakai untuk mengimputasi wilayah
     yang belum ter-scrape, agar pola geografisnya tidak seragam. */
  const mean = new Map();
  const collect = list => {
    let s = 0, w = 0, dpt = 0, cnt = 0;
    for (const k of list) if (k.base) { s += k.base.p19; w += k.base.sah; dpt += k.base.dpt; cnt++; }
    return cnt ? { p: w ? s / w : null, dpt: dpt / cnt, cnt } : null;
  };
  for (const P of root.anak) {
    const realKecP = [];
    for (const K of P.anak) {
      const rk = K.anak.filter(c => c.base);
      const mk = collect(rk); if (mk) mean.set(K.key, mk);
      realKecP.push(...rk);
    }
    const mp = collect(realKecP); if (mp) mean.set(P.key, mp);
  }
  let synthDpt = 0, realDpt = 0;
  for (const n of kecs) {
    if (n.base) { realDpt += n.base.dpt; continue; }
    const K = n.parent, P = K.parent;
    const rp = mulberry32(fnv('prov' + P.key)), rk = mulberry32(fnv('kab' + K.key)), rc = mulberry32(fnv('kec' + n.key));
    const mp = mean.get(P.key), mk = mean.get(K.key);
    const cl = x => Math.min(.93, Math.max(.07, x));
    const provTilt = mp && mp.p != null ? mp.p : .20 + .62 * rp();
    const kabTilt = mk && mk.p != null ? mk.p : cl(provTilt + (rk() * 2 - 1) * .13);
    const pr = cl(kabTilt + (rc() * 2 - 1) * .09);
    const scale = mp ? mp.dpt / 26000 : .55 + 1.15 * rp();
    const dpt = Math.max(900, Math.round((2600 + Math.pow(rc(), 2.0) * 66000) * scale));
    const guna = Math.round(dpt * (.68 + rc() * .22));
    const tsah = Math.round(guna * (.008 + rc() * .028));
    const sah = guna - tsah;
    n.base = { dpt, guna, sah, tsah, tps: Math.max(1, Math.round(dpt / 290)), p19: Math.round(sah * pr), j19: sah - Math.round(sah * pr) };
    n.sintetis = true; synthDpt += dpt;
  }
  /* skala wilayah imputasi agar DPT nasional mendekati DPT Pemilu 2024 (204,8 juta) */
  const TARGET = 204807222, f = synthDpt > 0 ? Math.max(.3, (TARGET - realDpt) / synthDpt) : 1;
  if (Math.abs(f - 1) > .01) for (const n of kecs) {
    if (!n.sintetis) continue;
    for (const k of ['dpt', 'guna', 'sah', 'tsah', 'tps', 'p19', 'j19']) n.base[k] = Math.round(n.base[k] * f);
    n.base.tps = Math.max(1, n.base.tps);
  }
  // rollup basis ke atas
  const roll = n => {
    if (n.lv >= 3) return n.base;
    const b = { dpt: 0, guna: 0, sah: 0, tsah: 0, tps: 0, p19: 0, j19: 0 };
    for (const k of n.anak) { const kb = roll(k); for (const f in b) b[f] += kb[f]; }
    n.base = b; return b;
  };
  roll(root);
  return root;
}

/* ── generator hasil ──────────────────────────────────────────────── */
let PBAR = .45;
function sharesFor(node, E) {
  const r = mulberry32(fnv(E.id + '|' + node.key));
  if (E.jenis === 'paslon') {
    /* Struktur geografis diikat ke pola 2019 yang nyata: basis Prabowo 2019 kuat
       berkorelasi dengan Anies 2024, basis Jokowi 2019 dengan Ganjar 2024. */
    const p = Math.min(.96, Math.max(.04, node.base.sah ? node.base.p19 / node.base.sah : PBAR));
    const a = PASLON[0].anchor * Math.pow(p / PBAR, 2.05) * (.86 + r() * .28);
    const g = PASLON[2].anchor * Math.pow((1 - p) / (1 - PBAR), 1.30) * (.86 + r() * .28);
    const pr = PASLON[1].anchor * (.90 + r() * .20);
    const s = a + g + pr; return [a / s, pr / s, g / s];
  }
  const out = E.opsi.map(o => Math.max(o.anchor * Math.exp((r() * 2 - 1) * E.spread), o.anchor * .06));
  const s = out.reduce((x, y) => x + y, 0);
  return out.map(v => v / s);
}
function buildElection(id) {
  if (S.res[id]) return S.res[id];
  const E = PEMILU.find(e => e.id === id), m = new Map(), N = E.opsi.length;

  if (id === 'pilpres') {
    for (const n of S.nodes.values()) {
      if (n.lv === 3) {
        m.set(n.key, [n.base.j19 || 0, n.base.p19 || 0]);
      }
    }
  } else if (id === 'dpr' && S.e2019 && S.e2019.dprri) {
    for (const n of S.nodes.values()) {
      if (n.lv === 3) {
        const v = S.e2019.dprri[n.name] || S.e2019.dprri[norm(n.name)];
        if (v && v.length === N && v.some(x => x > 0)) {
          m.set(n.key, v);
        } else {
          const r = mulberry32(fnv('dpr' + n.key));
          const sahs = n.base.sah || 1000;
          const sh = E.opsi.map(o => o.anchor * (.75 + r() * .5));
          const sum = sh.reduce((a, b) => a + b, 0) || 1;
          m.set(n.key, sh.map(x => Math.round(x * sahs / sum)));
        }
      }
    }
  } else {
    for (const n of S.nodes.values()) {
      if (n.lv === 3) {
        const r = mulberry32(fnv(id + n.key));
        const sahs = n.base.sah || 1000;
        const sh = E.opsi.map(o => o.anchor * (.7 + r() * .6));
        const sum = sh.reduce((a, b) => a + b, 0) || 1;
        m.set(n.key, sh.map(x => Math.round(x * sahs / sum)));
      }
    }
  }

  const up = n => {
    if (n.lv === 3) return m.get(n.key) || new Array(N).fill(0);
    const acc = new Array(N).fill(0);
    for (const c of n.anak) { const cv = up(c); for (let i = 0; i < N; i++) acc[i] += (cv[i] || 0); }
    m.set(n.key, acc); return acc;
  };
  up(S.root);
  S.res[id] = m; return m;
}

function votesOf(node) {
  if (S.pemilu === 'pilpres') {
    return [node.base.j19 || 0, node.base.p19 || 0];
  }
  const m = buildElection(S.pemilu);
  if (m.has(node.key)) return m.get(node.key);

  const C = node.parent, cv = m.get(C.key), kids = C.anak, N = cv.length;
  const totSah = kids.reduce((acc, k) => acc + (k.base.sah || 0), 0) || 1;
  const out = kids.map(k => {
    const ratio = (k.base.sah || 0) / totSah;
    return cv.map(v => Math.round(v * ratio));
  });
  kids.forEach((k, j) => m.set(k.key, out[j]));
  return m.get(node.key) || new Array(N).fill(0);
}
function sahOf(node) { return votesOf(node).reduce((a, b) => a + b, 0); }

/* ── warna ────────────────────────────────────────────────────────── */
function opsi() { return PEMILU.find(e => e.id === S.pemilu).opsi; }
function winnerOf(n) { const v = votesOf(n); let b = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; }
function marginOf(n) {
  const v = votesOf(n).slice().sort((a, b) => b - a), t = v.reduce((a, b) => a + b, 0) || 1;
  return (v[0] - (v[1] || 0)) / t;
}
const BGT = '#f3f2f2';
function activeUnits() {
  if (S.sel.lv === 0) return S.root.anak;
  if (S.sel.lv === 1) return S.sel.anak;
  return S.sel.anak.length ? S.sel.anak : [S.sel];
}
function updateScale() {
  const u = activeUnits();
  const t = u.map(n => n.base.dpt ? n.base.guna / n.base.dpt : 0).filter(x => x > 0);
  S.tDom = t.length ? [d3.quantile(t.slice().sort(d3.ascending), .02), d3.quantile(t.slice().sort(d3.ascending), .98)] : [.55, .9];
  if (S.tDom[1] - S.tDom[0] < .02) S.tDom = [S.tDom[0] - .01, S.tDom[1] + .01];
  const sh = u.map(n => { const v = votesOf(n), s = v.reduce((a, b) => a + b, 0) || 1; return v[S.fokus] / s; });
  S.sDom = [0, Math.max(.08, d3.max(sh) || .5)];
}
function colorOf(n) {
  const O = opsi();
  if (S.mode === 'turnout') {
    const t = n.base.dpt ? n.base.guna / n.base.dpt : 0;
    const [a, b] = S.tDom || [.55, .9];
    return d3.interpolateRgb('#f6f4f3', '#201e1d')(Math.min(1, Math.max(0, (t - a) / (b - a))));
  }
  if (S.mode === 'share') {
    const v = votesOf(n), t = v.reduce((a, b) => a + b, 0) || 1;
    const m = (S.sDom || [0, .75])[1];
    return d3.interpolateRgb(BGT, O[S.fokus].warna)(Math.min(1, (v[S.fokus] / t) / m));
  }
  const w = winnerOf(n), c = O[w].warna;
  if (S.mode === 'winner') return c;
  const t = Math.min(1, marginOf(n) / .5);
  return d3.interpolateRgb(d3.interpolateRgb(BGT, c)(.22), c)(t);
}

/* ── tabs ─────────────────────────────────────────────────────────── */
function renderTabs() {
  $('#tabs').innerHTML = PEMILU.map(e =>
    `<button class="tab" role="tab" data-e="${e.id}" aria-selected="${e.id === S.pemilu}">
      <span class="tk">${e.kicker}</span><span class="tn">${e.nama}</span></button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => {
    S.pemilu = b.dataset.e; S.fokus = Math.min(S.fokus, opsi().length - 1); renderTabs(); renderAll();
  });
}
function renderModes() {
  const modes = [['winner', 'Pemenang'], ['margin', 'Margin'], ['share', 'Perolehan'], ['turnout', 'Partisipasi']];
  $('#modeseg').innerHTML = modes.map(([k, l]) =>
    `<label class="seg-opt"><input type="radio" name="m" value="${k}" ${k === S.mode ? 'checked' : ''}>${l}</label>`).join('');
  $('#modeseg').querySelectorAll('input').forEach(i => i.onchange = () => { S.mode = i.value; renderModes(); renderAll(); });
  const sh = S.mode === 'share';
  $('#focussel').hidden = !sh; $('#focuslab').hidden = !sh;
  if (sh) {
    $('#focussel').innerHTML = opsi().map((o, i) =>
      `<option value="${i}" ${i === S.fokus ? 'selected' : ''}>${o.no}. ${o.pendek}</option>`).join('');
    $('#focussel').onchange = e => { S.fokus = +e.target.value; renderAll(); };
  }
}
function renderLegend() {
  const O = opsi(), L = $('#legend'), lvl = ANAK[S.sel.lv] || LEVELS[S.sel.lv];
  if (S.mode === 'turnout') {
    const [a, b] = S.tDom || [.55, .9];
    L.innerHTML = `<span class="modelab">Partisipasi per ${lvl.toLowerCase()}</span><span>${pct(a, 0)}</span>
      <span class="ramp">${d3.range(9).map(i => `<i style="background:${d3.interpolateRgb('#f6f4f3', '#201e1d')(i / 8)}"></i>`).join('')}</span><span>${pct(b, 0)}</span>`;
    return;
  }
  if (S.mode === 'share') {
    const c = O[S.fokus].warna, m = (S.sDom || [0, .75])[1];
    L.innerHTML = `<span class="modelab">${O[S.fokus].no}. ${O[S.fokus].pendek}</span><span>0%</span>
      <span class="ramp">${d3.range(9).map(i => `<i style="background:${d3.interpolateRgb(BGT, c)(i / 8)}"></i>`).join('')}</span><span>${pct(m, 0)}</span>`;
    return;
  }
  const top = S.pemilu === 'pilpres' ? O : O.slice().sort((a, b) => b.anchor - a.anchor).slice(0, 9);
  L.innerHTML = top.map(o => `<span class="lgi"><span class="sw" style="background:${o.warna}"></span>${o.no}. ${o.pendek}</span>`).join('')
    + (S.mode === 'margin' ? `<span class="lgi" style="margin-left:auto"><span class="modelab">Terang = margin tipis</span></span>` : '');
}

/* ── peta geografis ───────────────────────────────────────────────── */
let projection, path, zoom, svg, gLayer, gProv, gKab, gKec, gDesa, dims = [0, 0];
S.geoKec = {};
S.geoDesa = {};

function initMap() {
  svg = d3.select('#map'); svg.selectAll('*').remove();
  gLayer = svg.append('g');
  gProv = gLayer.append('g'); gKab = gLayer.append('g');
  gKec = gLayer.append('g'); gDesa = gLayer.append('g');
  zoom = d3.zoom().scaleExtent([1, 260]).on('zoom', ev => gLayer.attr('transform', ev.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  $('#zin').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.7);
  $('#zout').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.7);
  $('#zrst').onclick = () => select(S.root);
}
function fitProjection(featureCollection) {
  const el = $('#viewport'), w = el.clientWidth || 800, h = el.clientHeight || 500;
  dims = [w, h];
  svg.attr('viewBox', `0 0 ${w} ${h}`);
  const fc = featureCollection || S.geoProv;
  if (!fc) return;
  projection = d3.geoMercator().fitExtent([[12, 12], [w - 12, h - 12]], fc);
  path = d3.geoPath(projection);
}
function provNodeFor(feature) {
  const vals = Object.values(feature.properties || {}).filter(v => typeof v === 'string');
  for (const v of vals) { const n = S.provByNorm.get(norm(v)); if (n) return n; }
  return null;
}
const stripKab = s => norm(s).replace(/^(KABUPATEN|KAB|KOTA ADMINISTRASI|KOTA ADM|KOTA)\s+/, '').trim();
const tight = s => stripKab(s).replace(/\s+/g, '');
function kabNodeFor(feature, P) {
  const vals = Object.values(feature.properties || {}).filter(v => typeof v === 'string');
  for (const v of vals) { const k = P.kabByNorm.get(stripKab(v)) || P.kabByTight.get(tight(v)); if (k) return k; }
  for (const v of vals) {
    const t = tight(v); if (t.length < 7) continue;
    for (const [key, node] of P.kabByTight) if (key.includes(t) || t.includes(key)) return node;
  }
  return null;
}

async function loadKecGIS(kabNode) {
  if (!kabNode) return null;
  const key = kabNode.key;
  if (S.geoKec[key] !== undefined) return S.geoKec[key];

  const kabName = stripKab(kabNode.name);
  // Try BPS code from index first
  const bpsCode = S.kecIndex ? S.kecIndex[kabName] : null;
  if (bpsCode) {
    try {
      const res = await fetch(`data/gis/kec/${encodeURIComponent(bpsCode)}.json`);
      if (res.ok) { S.geoKec[key] = await res.json(); return S.geoKec[key]; }
    } catch (e) {}
  }
  // Fallback: load individual kecamatan files for each child and merge
  const allFeatures = [];
  const fetches = kabNode.anak.map(async (child) => {
    const kecName = norm(child.name).replace(/[^A-Z0-9_\-\s]/g, '').trim();
    try {
      const res = await fetch(`data/gis/kec/${encodeURIComponent(kecName)}.json`);
      if (res.ok) {
        const j = await res.json();
        if (j.features) allFeatures.push(...j.features);
      }
    } catch (e) {}
  });
  await Promise.all(fetches);
  if (allFeatures.length > 0) {
    S.geoKec[key] = { type: 'FeatureCollection', features: allFeatures };
    return S.geoKec[key];
  }
  S.geoKec[key] = null;
  return null;
}

async function loadDesaGIS(kecNode) {
  if (!kecNode) return null;
  const key = kecNode.key;
  if (S.geoDesa[key] !== undefined) return S.geoDesa[key];

  const kecName = norm(kecNode.name);
  const baseKecName = kecName.split(' ')[0];
  const kabNode = kecNode.parent;
  const kabName = kabNode ? stripKab(kabNode.name) : '';

  const candidates = [];
  if (kabName && kecName) candidates.push(`${kabName}_${kecName}`);
  if (kecName) candidates.push(kecName);
  if (kabName && baseKecName && baseKecName !== kecName) candidates.push(`${kabName}_${baseKecName}`);
  if (baseKecName && baseKecName !== kecName) candidates.push(baseKecName);

  for (const c of candidates) {
    try {
      const res = await fetch(`data/gis/desa/${encodeURIComponent(c)}.json`);
      if (res.ok) {
        S.geoDesa[key] = await res.json();
        return S.geoDesa[key];
      }
    } catch (e) {}
  }
  S.geoDesa[key] = null;
  return null;
}

function kecNodeFor(feature, kabNode) {
  const fName = norm(feature.properties.name || '');
  if (!fName || !kabNode) return null;
  for (const child of kabNode.anak) {
    if (norm(child.name) === fName) return child;
  }
  for (const child of kabNode.anak) {
    if (norm(child.name).includes(fName) || fName.includes(norm(child.name))) return child;
  }
  return null;
}

function desaNodeFor(feature, kecNode) {
  const fName = norm(feature.properties.name || '');
  if (!fName || !kecNode) return null;
  for (const child of kecNode.anak) {
    if (norm(child.name) === fName) return child;
  }
  for (const child of kecNode.anak) {
    if (norm(child.name).includes(fName) || fName.includes(norm(child.name))) return child;
  }
  return null;
}

async function drawGeo() {
  if (!S.geoProv) return;
  const lv = S.sel.lv;

  if (lv <= 1) {
    gKec.selectAll('path').remove();
    gDesa.selectAll('path').remove();
    const anc = lv === 1 ? S.sel : null;
    
    fitProjection(S.geoProv);
    gProv.selectAll('path').data(S.geoProv.features).join('path')
      .attr('class', d => {
        const n = provNodeFor(d);
        return 'region' + (anc && n && n.key === anc.key ? ' sel' : (anc && n ? ' dim' : ''));
      })
      .attr('d', path)
      .attr('fill', d => { const n = provNodeFor(d); return n ? colorOf(n) : '#d7d3d3'; })
      .attr('opacity', anc ? .55 : 1)
      .style('pointer-events', anc ? 'none' : 'auto')
      .on('click', (e, d) => { const n = provNodeFor(d); if (n) select(n); })
      .on('mousemove', (e, d) => { const n = provNodeFor(d); if (n) tipShow(e, n); })
      .on('mouseleave', tipHide);

    const kabFC = anc && S.geoKab[anc.key];
    if (kabFC) {
      gKab.selectAll('path').data(kabFC.features).join('path')
        .attr('class', d => { const n = kabNodeFor(d, anc); return 'region' + (n && S.sel.lv >= 2 && ancestorAt(S.sel, 2) && ancestorAt(S.sel, 2).key === n.key ? ' sel' : ''); })
        .attr('d', path)
        .attr('fill', d => { const n = kabNodeFor(d, anc); return n ? colorOf(n) : '#c9c5c5'; })
        .style('pointer-events', 'auto')
        .on('click', (e, d) => { const n = kabNodeFor(d, anc); if (n) select(n); })
        .on('mousemove', (e, d) => { const n = kabNodeFor(d, anc); if (n) tipShow(e, n); else tipHide(); })
        .on('mouseleave', tipHide);
    } else gKab.selectAll('path').remove();
    return;
  }

  if (lv === 2) {
    gProv.selectAll('path').remove();
    gKab.selectAll('path').remove();
    gDesa.selectAll('path').remove();

    const kabNode = S.sel;
    const kecFC = await loadKecGIS(kabNode);

    if (kecFC && kecFC.features && kecFC.features.length > 0) {
      fitProjection(kecFC);
      svg.call(zoom.transform, d3.zoomIdentity);

      gKec.selectAll('path').data(kecFC.features).join('path')
        .attr('class', d => {
          const n = kecNodeFor(d, kabNode);
          return 'region';
        })
        .attr('d', path)
        .attr('fill', d => {
          const n = kecNodeFor(d, kabNode);
          return n ? colorOf(n) : '#d7d3d3';
        })
        .style('pointer-events', 'auto')
        .on('click', (e, d) => {
          const n = kecNodeFor(d, kabNode);
          if (n) select(n);
        })
        .on('mousemove', (e, d) => {
          const n = kecNodeFor(d, kabNode);
          if (n) tipShow(e, n); else tipHide();
        })
        .on('mouseleave', tipHide);
      return;
    } else {
      const P = kabNode.parent;
      const kabFC = P && S.geoKab[P.key];
      if (kabFC) {
        fitProjection(kabFC);
        gKab.selectAll('path').data(kabFC.features).join('path')
          .attr('class', d => { const n = kabNodeFor(d, P); return 'region' + (n && n.key === kabNode.key ? ' sel' : ' dim'); })
          .attr('d', path)
          .attr('fill', d => { const n = kabNodeFor(d, P); return n ? colorOf(n) : '#c9c5c5'; })
          .style('pointer-events', 'auto')
          .on('click', (e, d) => { const n = kabNodeFor(d, P); if (n) select(n); })
          .on('mousemove', (e, d) => { const n = kabNodeFor(d, P); if (n) tipShow(e, P); else tipHide(); })
          .on('mouseleave', tipHide);
      }
    }
  }

  if (lv >= 3) {
    gProv.selectAll('path').remove();
    gKab.selectAll('path').remove();
    gKec.selectAll('path').remove();

    const kecNode = ancestorAt(S.sel, 3);
    const desaFC = await loadDesaGIS(kecNode);

    if (desaFC && desaFC.features && desaFC.features.length > 0) {
      fitProjection(desaFC);
      svg.call(zoom.transform, d3.zoomIdentity);

      gDesa.selectAll('path').data(desaFC.features).join('path')
        .attr('class', d => {
          const n = desaNodeFor(d, kecNode);
          const isSel = n && S.sel.key === n.key;
          return 'region' + (isSel ? ' sel' : '');
        })
        .attr('d', path)
        .attr('fill', d => {
          const n = desaNodeFor(d, kecNode);
          return n ? colorOf(n) : '#d7d3d3';
        })
        .style('pointer-events', 'auto')
        .on('click', (e, d) => {
          const n = desaNodeFor(d, kecNode);
          if (n) select(n);
        })
        .on('mousemove', (e, d) => {
          const n = desaNodeFor(d, kecNode);
          if (n) tipShow(e, n); else tipHide();
        })
        .on('mouseleave', tipHide);
      return;
    }
  }
}
function zoomToFeature(feature, dur = 700) {
  if (!feature) { svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity); return; }
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const [w, h] = dims;
  const k = Math.min(40, .82 / Math.max((x1 - x0) / w, (y1 - y0) / h));
  const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  svg.transition().duration(dur).call(zoom.transform, t);
}
function featureOfProv(node) { return S.geoProv.features.find(f => { const n = provNodeFor(f); return n && n.key === node.key; }); }
function featureOfKab(node) {
  const P = node.parent, fc = S.geoKab[P.key]; if (!fc) return null;
  return fc.features.find(f => { const n = kabNodeFor(f, P); return n && n.key === node.key; });
}
async function loadKab(P) {
  if (S.geoKab[P.key] !== undefined) return S.geoKab[P.key];
  const folder = ATLAS[P.name]; if (!folder) { S.geoKab[P.key] = null; return null; }
  try {
    const url = GH + 'kabupaten-kota/' + encodeURIComponent(folder) + '/' + slug(folder) + '-simplified-topo.json';
    const topo = await (await fetch(url)).json();
    const key = Object.keys(topo.objects)[0];
    S.geoKab[P.key] = topojson.feature(topo, topo.objects[key]);
  } catch (e) { console.warn('gagal memuat geometri', P.name, e); S.geoKab[P.key] = null; }
  return S.geoKab[P.key];
}

/* ── grid kartogram (kecamatan & kelurahan) ───────────────────────── */
function renderGrid() {
  const wrap = $('#gridwrap'), n = S.sel, kids = n.anak;
  const O = opsi();
  if (!kids.length) {
    wrap.innerHTML = `<div class="gridhead"><h4>${n.name}</h4></div>
      <p class="note">Tidak ada wilayah di bawah tingkat ini pada dataset. Untuk kecamatan tanpa rincian desa,
      jalankan ulang scraper KPU pada wilayah tersebut lalu tambahkan hasilnya ke <code>data/wilayah.json</code>.</p>`;
    return;
  }
  const rows = kids.map(k => ({ k, v: votesOf(k), s: sahOf(k) }));
  rows.sort((a, b) => S.sort.d * ((S.sort.k === 'n' ? (a.k.name > b.k.name ? 1 : -1) : a.s - b.s)));
  wrap.innerHTML = `<div class="gridhead"><h4>${ANAK[n.lv]} di ${n.name}</h4>
      <span class="note">${kids.length} wilayah · klik untuk memperdalam${n.lv === 2 ? ' · geometri kecamatan tidak tersedia, ditampilkan sebagai grid' : ''}</span></div>
    <div class="cellgrid">${rows.map(({ k, v, s }) => {
    const w = winnerOf(k), t = s || 1;
    const nodata = k.lv === 3 && !k.anak.length;
    return `<button class="cell${nodata ? ' nodata' : ''}" data-k="${k.key}">
        <div class="cn">${k.name}</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span class="cpct" style="color:${O[w].warna}">${pct(v[w] / t, 0)}</span>
          <span class="cw">${O[w].no} ${O[w].pendek}</span></div>
        <div class="cbar">${v.map((x, i) => x / t > .008 ? `<i style="flex:${x};background:${O[i].warna}"></i>` : '').join('')}</div>
        <div class="cw">${fmt(s)} suara sah${nodata ? ' · tanpa rincian desa' : ''}</div>
      </button>`;
  }).join('')}</div>`;
  wrap.querySelectorAll('.cell').forEach(b => {
    const node = S.nodes.get(b.dataset.k);
    b.onclick = () => select(node);
    b.onmousemove = e => tipShow(e, node);
    b.onmouseleave = tipHide;
  });
}
function renderLocator() {
  const anc = ancestorAt(S.sel, 1); const loc = $('#locator');
  if (!anc || S.sel.lv < 2) { loc.hidden = true; return; }
  loc.hidden = false;
  $('#loclab').textContent = anc.name + (ancestorAt(S.sel, 2) ? ' › ' + ancestorAt(S.sel, 2).name : '');
  const fc = S.geoKab[anc.key], sel2 = ancestorAt(S.sel, 2);
  const s = d3.select('#locsvg'); s.selectAll('*').remove();
  if (!fc) { loc.hidden = true; return; }
  const w = loc.clientWidth - 10, h = 76;
  s.attr('viewBox', `0 0 ${w} ${h}`);
  const p = d3.geoPath(d3.geoMercator().fitExtent([[3, 3], [w - 3, h - 3]], fc));
  s.append('g').selectAll('path').data(fc.features).join('path').attr('d', p)
    .attr('fill', d => { const n = kabNodeFor(d, anc); return n && sel2 && n.key === sel2.key ? '#ec3013' : '#d7d3d3'; })
    .attr('stroke', '#f3f2f2').attr('stroke-width', .5);
}

/* ── tooltip ──────────────────────────────────────────────────────── */
const tip = $('#tip');
function tipShow(e, n) {
  const O = opsi(), v = votesOf(n), t = v.reduce((a, b) => a + b, 0) || 1, w = winnerOf(n);
  const top = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
  tip.innerHTML = `<b>${n.name}</b>${LEVELS[n.lv]} · ${fmt(t)} suara sah<br>` +
    top.map(([x, i]) => `<span style="color:${O[i].warna}">■</span> ${O[i].pendek} ${pct(x / t)}`).join('<br>');
  tip.style.opacity = 1;
  tip.style.left = Math.min(window.innerWidth - 262, e.clientX + 14) + 'px';
  tip.style.top = Math.min(window.innerHeight - 96, e.clientY + 14) + 'px';
}
function tipHide() { tip.style.opacity = 0; }

/* ── panel analisis ───────────────────────────────────────────────── */
let showAll = false;
function ancestorAt(n, lv) { while (n && n.lv > lv) n = n.parent; return n && n.lv === lv ? n : null; }
function renderPanel() {
  const n = S.sel, O = opsi(), E = PEMILU.find(e => e.id === S.pemilu);
  const v = votesOf(n), t = v.reduce((a, b) => a + b, 0) || 1, w = winnerOf(n), b = n.base;
  const ranked = v.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x);
  const shown = (E.jenis === 'paslon' || showAll) ? ranked : ranked.slice(0, 6);
  const turnout = b.dpt ? b.guna / b.dpt : 0;

  const bars = shown.map(({ x, i }) => `
    <div class="bar">
      <div class="bn"><span class="dot" style="background:${O[i].warna}"></span><span>${O[i].no}. ${O[i].pendek}</span></div>
      <div class="bv">${pct(x / t)}</div>
      <div class="btrack"><i class="bfill" style="width:${(x / t * 100).toFixed(2)}%;background:${O[i].warna}"></i></div>
      <div class="babs">${fmt(x)} suara</div>
    </div>`).join('');

  /* perbandingan 2019 — angka asli hasil scraping bila tersedia */
  const has19 = (b.j19 + b.p19) > 0;
  const s19 = b.j19 + b.p19 || 1;
  const cmp = E.jenis === 'paslon' && has19 ? `
    <div class="psec">
      <div class="ph">Perbandingan Pilpres 2019 ${n.sintetis || !hasRealBelow(n) ? '· basis contoh' : '· hasil scraping KPU'}</div>
      <div class="cmp">
        <span class="h">Paslon</span><span class="h" style="text-align:right">2019</span><span class="h" style="text-align:right">Δ 2024</span>
        <span>01 Jokowi–Ma'ruf</span><b style="text-align:right">${pct(b.j19 / s19)}</b>
        <span class="delta" style="text-align:right">—</span>
        <span>02 Prabowo–Sandi</span><b style="text-align:right">${pct(b.p19 / s19)}</b>
        <span class="delta" style="text-align:right;color:${v[1] / t - b.p19 / s19 >= 0 ? '#ae1800' : '#605d5d'}">${(v[1] / t - b.p19 / s19 >= 0 ? '+' : '') + pct(v[1] / t - b.p19 / s19)}</span>
      </div>
      <p class="note" style="margin:8px 0 0">Δ membandingkan Prabowo 2019 dengan Prabowo–Gibran 2024.</p>
    </div>` : '';

  const kids = n.anak;
  const kidRows = kids.map(k => { const kv = votesOf(k), kt = kv.reduce((a, x) => a + x, 0) || 1; return { k, kv, kt, w: winnerOf(k) }; })
    .sort((a, b) => b.kt - a.kt);

  $('#panel').innerHTML = `
    <div class="psec">
      <div class="ph">${LEVELS[n.lv]}${n.code !== '0' && n.code !== '—' ? ' · kode ' + n.code : ''}</div>
      <h2 class="rtitle">${n.name}</h2>
      <div class="rmeta">${crumbText(n)}</div>
      <div class="winner" style="background:${O[w].warna}">
        <span class="wn">${O[w].no}. ${E.jenis === 'paslon' ? O[w].pendek : O[w].nama}</span>
        <span class="wp">${pct(v[w] / t, 1)}</span>
      </div>
      <div class="rmeta" style="margin-top:6px">Unggul ${pct(marginOf(n))} atas peringkat kedua</div>
    </div>

    <div class="psec">
      <div class="ph">Perolehan suara${E.jenis === 'dpd' ? ' · calon' : ''}</div>
      <div class="bars">${bars}</div>
      ${E.jenis !== 'paslon' ? `<button class="more" id="moreb">${showAll ? '↑ Ringkas' : '↓ Lihat selengkapnya (' + O.length + ' ' + (E.jenis === 'dpd' ? 'calon' : 'partai') + ')'}</button>` : ''}
    </div>

    ${E.jenis === 'dpd' ? `<div class="psec"><div class="ph">Empat calon terpilih${n.lv > 1 ? ' di ' + ancestorAt(n, 1).name : ''}</div>
      <div class="childlist">${(() => { const P = ancestorAt(n, 1) || S.root; const pv = votesOf(P), pt = pv.reduce((a, x) => a + x, 0) || 1;
        return pv.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x).slice(0, 4).map((o, r) =>
        `<div class="chi" style="cursor:default"><span class="dot" style="background:${O[o.i].warna}"></span>
          <span class="cnm">${r + 1}. ${O[o.i].nama}</span><span class="cvp">${pct(o.x / pt)}</span></div>`).join(''); })()}</div>
      <p class="note" style="margin:8px 0 0">Nama calon adalah pengganti sementara; ganti dari data DPD 2024 KPU.</p></div>` : ''}

    <div class="psec">
      <div class="ph">Suara & partisipasi</div>
      <dl class="kv">
        <dt>Suara sah</dt><dd>${fmt(t)}</dd>
        <dt>Suara tidak sah</dt><dd>${fmt(b.tsah)}</dd>
        <dt>Total suara masuk</dt><dd>${fmt(t + b.tsah)}</dd>
        <dt>Pemilih terdaftar (DPT)</dt><dd>${fmt(b.dpt)}</dd>
        <dt>Pengguna hak pilih</dt><dd>${fmt(b.guna)}</dd>
        <dt>Jumlah TPS</dt><dd>${fmt(b.tps)}</dd>
      </dl>
      <div class="turnout"><i style="width:${(turnout * 100).toFixed(1)}%"></i></div>
      <div class="rmeta">Partisipasi ${pct(turnout)} · suara tidak sah ${pct(b.tsah / (t + b.tsah))}</div>
    </div>
    ${cmp}
    ${kids.length ? `<div class="psec">
      <div class="ph">${ANAK[n.lv]} (${kids.length}) · klik untuk memperdalam</div>
      <div class="childlist">${kidRows.map(({ k, kv, kt, w }) => `
        <button class="chi" data-k="${k.key}">
          <span class="dot" style="background:${O[w].warna}"></span>
          <span class="cnm">${k.name}</span>
          <span class="cvp">${pct(kv[w] / kt, 0)}</span></button>`).join('')}</div></div>` : ''}
    <div class="psec">
      <div class="banner"><span>⚑</span><span><b>Angka 2024 adalah data contoh.</b> Hierarki wilayah, jumlah TPS dan
      angka 2019 diambil dari hasil scraping KPU milik Anda. Perolehan 2024 dihasilkan model deterministik
      sampai file resmi dipasang.</span></div>
    </div>`;

  const mb = $('#moreb'); if (mb) mb.onclick = () => { showAll = !showAll; renderPanel(); };
  $('#panel').querySelectorAll('.chi[data-k]').forEach(el => el.onclick = () => select(S.nodes.get(el.dataset.k)));
}
function hasRealBelow(n) { if (n.lv === 3) return !!n.anak.length; if (n.lv === 4) return true; return n.anak.some(hasRealBelow); }

/* ── breadcrumb, tabel, pencarian ─────────────────────────────────── */
function chain(n) { const a = []; while (n) { a.unshift(n); n = n.parent; } return a; }
function crumbText(n) { return chain(n).slice(0, -1).map(x => x.name).join(' › ') || 'Republik Indonesia'; }
function renderCrumbs() {
  const c = chain(S.sel);
  $('#crumbs').innerHTML = c.map((n, i) =>
    `${i ? '<span class="crumbsep">›</span>' : ''}<button class="crumb" data-k="${n.key}" aria-current="${i === c.length - 1}">${n.name}</button>`).join('');
  $('#crumbs').querySelectorAll('.crumb').forEach(b => b.onclick = () => select(S.nodes.get(b.dataset.k)));
  $('#viewinfo').textContent = S.sel.lv <= 1 ? 'Peta geografis' : 'Grid wilayah · tanpa geometri';
}
function renderTable() {
  const n = S.sel, O = opsi(), kids = n.anak, T = $('#dtable');
  if (!kids.length) { T.innerHTML = '<tbody><tr><td style="padding:14px">Tidak ada rincian wilayah di bawah ' + n.name + '.</td></tr></tbody>'; return; }
  const cols = O.length > 8 ? O.slice().sort((a, b) => b.anchor - a.anchor).slice(0, 8) : O;
  const idx = cols.map(c => O.indexOf(c));
  const rows = kids.map(k => ({ k, v: votesOf(k), s: sahOf(k) }));
  rows.sort((a, b) => S.sort.d * (S.sort.k === 'n' ? (a.k.name > b.k.name ? 1 : -1) : S.sort.k === 'v' ? a.s - b.s : a.v[S.sort.k] / (a.s || 1) - b.v[S.sort.k] / (b.s || 1)));
  T.innerHTML = `<thead><tr>
      <th data-s="n">${ANAK[n.lv]}</th><th data-s="v" style="text-align:right">Suara sah</th>
      <th style="text-align:right">Partisipasi</th>
      ${cols.map((c, j) => `<th data-s="${idx[j]}" style="text-align:right">${c.pendek}</th>`).join('')}
      <th>Unggul</th></tr></thead>
    <tbody>${rows.map(({ k, v, s }) => { const w = winnerOf(k), t = s || 1; return `<tr>
      <td class="nm" data-k="${k.key}">${k.name}</td><td style="text-align:right">${fmt(s)}</td>
      <td style="text-align:right">${k.base.dpt ? pct(k.base.guna / k.base.dpt, 1) : '—'}</td>
      ${idx.map(i => `<td style="text-align:right">${pct(v[i] / t, 1)}</td>`).join('')}
      <td><span class="dot" style="display:inline-block;background:${O[w].warna}"></span> ${O[w].pendek}</td></tr>`; }).join('')}</tbody>`;
  T.querySelectorAll('th[data-s]').forEach(th => th.onclick = () => {
    const k = th.dataset.s === 'n' || th.dataset.s === 'v' ? th.dataset.s : +th.dataset.s;
    S.sort = { k, d: S.sort.k === k ? -S.sort.d : -1 }; renderTable(); renderGrid();
  });
  T.querySelectorAll('td.nm').forEach(td => td.onclick = () => select(S.nodes.get(td.dataset.k)));
}
function buildIndex() {
  for (const n of S.nodes.values()) if (n.lv > 0) S.index.push({ n, s: n.name.toUpperCase() });
}
function search(q) {
  q = q.trim().toUpperCase(); const box = $('#qr');
  if (q.length < 2) { box.hidden = true; return; }
  const hits = [];
  for (const it of S.index) { if (it.s.startsWith(q)) { hits.push(it); if (hits.length > 40) break; } }
  if (hits.length < 25) for (const it of S.index) { if (!it.s.startsWith(q) && it.s.includes(q)) { hits.push(it); if (hits.length > 40) break; } }
  hits.sort((a, b) => a.n.lv - b.n.lv);
  box.hidden = false;
  box.innerHTML = hits.slice(0, 30).map(h =>
    `<button data-k="${h.n.key}"><span class="rl">${LEVELS[h.n.lv]}</span><br>${h.n.name}
      <span class="rl"> — ${crumbText(h.n)}</span></button>`).join('') || '<div style="padding:8px;font-size:12px">Tidak ditemukan.</div>';
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    select(S.nodes.get(b.dataset.k)); box.hidden = true; $('#q').value = '';
  });
}
function exportCSV() {
  const n = S.sel, O = opsi(), kids = n.anak;
  if (!kids.length) return;
  const head = ['wilayah', 'tingkat', 'dpt', 'pengguna', 'suara_sah', 'suara_tidak_sah', ...O.map(o => o.no + '_' + o.pendek.replace(/\s+/g, '_'))];
  const lines = [head.join(',')].concat(kids.map(k => {
    const v = votesOf(k);
    return ['"' + k.name + '"', ANAK[n.lv], k.base.dpt, k.base.guna, sahOf(k), k.base.tsah, ...v].join(',');
  }));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `pemilu2024-${S.pemilu}-${n.name.toLowerCase().replace(/\s+/g, '-')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ── orkestrasi ───────────────────────────────────────────────────── */
async function select(node) {
  if (!node) return;
  S.sel = node; showAll = false;
  const P = ancestorAt(node, 1);
  if (P) await loadKab(P);
  await renderAll();
  if (node.lv <= 1) {
    zoomToFeature(node.lv === 0 ? null : featureOfProv(node));
  }
}
async function renderAll() {
  $('#map').style.display = '';
  $('#gridwrap').hidden = true;
  $('#zoombtns').style.display = '';
  renderCrumbs(); renderModes(); updateScale(); renderLegend();
  await drawGeo();
  renderLocator(); renderPanel(); renderTable();
  $('#srcnote').textContent = `${S.nodes.size.toLocaleString('id-ID')} wilayah dimuat · geometri: GIS SHP KPU 2019 · basis: scraping KPU`;
}

(async function boot() {
  try {
    const raw = await (await fetch('data/wilayah.json')).json();
    S.root = buildTree(raw);
    S.provByNorm = new Map(S.root.anak.map(p => [norm(p.name), p]));
    S.root.anak.forEach(p => {
      p.kabByNorm = new Map(); p.kabByTight = new Map();
      p.anak.forEach(k => { p.kabByNorm.set(stripKab(k.name), k); p.kabByTight.set(tight(k.name), k); });
    });
    buildIndex();
    try { S.e2019 = await (await fetch('data/election2019.json')).json(); } catch (e) { console.warn('election2019.json failed', e); }
    try { S.kecIndex = await (await fetch('data/gis/kec_index.json')).json(); } catch (e) { S.kecIndex = {}; }
    S.sel = S.root;
    renderTabs(); initMap();
    buildElection('pilpres');
    $('#loading').textContent = 'Memuat peta…';
    try {
      const topo = await (await fetch(GH + 'provinsi/provinces-simplified-topo.json')).json();
      const key = Object.keys(topo.objects)[0];
      S.geoProv = topojson.feature(topo, topo.objects[key]);
      const miss = S.geoProv.features.filter(f => !provNodeFor(f));
      if (miss.length) console.warn('provinsi tanpa pasangan data:', miss.map(f => JSON.stringify(f.properties)));
      fitProjection();
    } catch (e) {
      console.warn('geometri provinsi gagal dimuat', e);
      $('#viewport').insertAdjacentHTML('beforeend',
        '<div class="loading" style="padding:20px;text-align:center">Geometri peta tidak dapat diunduh.<br>Grid wilayah tetap berfungsi.</div>');
    }
    $('#loading').remove();
    renderAll();
  } catch (e) {
    console.error(e);
    $('#loading').textContent = 'Gagal memuat data: ' + e.message;
  }
  $('#q').addEventListener('input', e => search(e.target.value));
  $('#q').addEventListener('blur', () => setTimeout(() => { $('#qr').hidden = true; }, 180));
  $('#ttoggle').onclick = () => $('#tablewrap').classList.toggle('open');
  $('#tcsv').onclick = exportCSV;
  addEventListener('resize', () => { if (S.geoProv) { fitProjection(); if (S.sel.lv <= 1) drawGeo(); } });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.key === 'Escape' || e.key === 'Backspace') && S.sel.parent) { e.preventDefault(); select(S.sel.parent); }
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    const i = ['1', '2', '3', '4', '5'].indexOf(e.key);
    if (i >= 0) document.querySelectorAll('.tab')[i].click();
  });
})();
