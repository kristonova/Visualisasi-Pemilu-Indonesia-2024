'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('app.js', 'utf8');
const wilayah = JSON.parse(fs.readFileSync('data/wilayah.json', 'utf8'));
const kecIndex = JSON.parse(fs.readFileSync('data/gis/kec_index.json', 'utf8'));

const norm = s => String(s).toUpperCase()
  .replace(/DAERAH ISTIMEWA|DAERAH KHUSUS IBUKOTA|PROVINSI|^DKI |^DI /g, ' ')
  .replace(/[^A-Z]+/g, ' ').trim();

// Evaluasi fungsi resolver yang benar-benar dipakai browser, tanpa menjalankan
// boot DOM aplikasi. Jika implementasinya berubah, fixture di bawah tetap
// menguji kontrak pemetaan yang sama.
const resolverStart = source.indexOf('const stripKab');
const resolverEnd = source.indexOf('function bindKabGeoCodes');
assert(resolverStart >= 0 && resolverEnd > resolverStart, 'resolver kabupaten/kota tidak ditemukan');
const resolver = new Function('norm', source.slice(resolverStart, resolverEnd)
  + '\nreturn { kabNodeFor, kabFeatureType, compact, normKec, compactKec };')(norm);

const kecStart = source.indexOf('const KEC_GEO_ALIASES');
const kecEnd = source.indexOf('function bindKecGeoNames');
assert(kecStart >= 0 && kecEnd > kecStart, 'resolver kecamatan tidak ditemukan');
const kecNodeFor = new Function('norm', 'normKec', 'compactKec', source.slice(kecStart, kecEnd)
  + '\nreturn kecNodeFor;')(norm, resolver.normKec, resolver.compactKec);

const desaStart = source.indexOf('const DESA_KAB_LABEL_ALIASES');
const desaEnd = source.indexOf('async function drawGeo');
assert(desaStart >= 0 && desaEnd > desaStart, 'resolver desa tidak ditemukan');
const desaResolver = new Function('norm', 'compact', 'compactKec', source.slice(desaStart, desaEnd)
  + '\nreturn { desaKabLabels, desaKecLabels, sameKabLabel, sameKecLabel, desaNodeFor };')(
  norm, resolver.compact, resolver.compactKec
);

function provinceNode(name) {
  const raw = wilayah.prov.find(p => p.n.replace(/^\+\s*/, '').toUpperCase() === name);
  assert(raw, `provinsi fixture tidak ditemukan: ${name}`);
  const province = { name, key: name, anak: [] };
  province.anak = raw.kab.map(kab => ({ name: kab.n, key: `${name}|${kab.n}`, parent: province }));
  return province;
}

function feature(id, province, kabkot) {
  return { id, properties: { provinsi: province, kabkot } };
}

function expectKab(province, id, atlasProvince, kabkot, expected) {
  const hit = resolver.kabNodeFor(feature(id, atlasProvince, kabkot), province);
  assert(hit, `${id} ${kabkot} tidak mendapat pasangan`);
  assert.strictEqual(hit.name, expected, `${id} ${kabkot} salah pasangan`);
}

const diy = provinceNode('DAERAH ISTIMEWA YOGYAKARTA');
[
  ['34-01', 'Kulon Progo', 'KULON PROGO'],
  ['34-02', 'Bantul', 'BANTUL'],
  ['34-03', 'Gunung Kidul', 'GUNUNGKIDUL'],
  ['34-04', 'Sleman', 'SLEMAN'],
  ['34-71', 'Yogyakarta', 'KOTA YOGYAKARTA'],
].forEach(([id, atlasName, expected]) => expectKab(diy, id, 'Yogyakarta', atlasName, expected));

// Provinsi eponim: field `provinsi` tidak boleh mengalahkan `kabkot`.
expectKab(provinceNode('JAMBI'), '15-01', 'Jambi', 'Kerinci', 'KERINCI');
expectKab(provinceNode('BENGKULU'), '17-01', 'Bengkulu', 'Bengkulu Selatan', 'BENGKULU SELATAN');

// Kabupaten/kota senama dibedakan oleh tipe pada suffix ID BPS.
const gorontalo = provinceNode('GORONTALO');
expectKab(gorontalo, '75-02', 'Gorontalo', 'Gorontalo', 'GORONTALO.');
expectKab(gorontalo, '75-71', 'Gorontalo', 'Gorontalo', 'KOTA GORONTALO');
const jabar = provinceNode('JAWA BARAT');
expectKab(jabar, '32-01', 'Jawa Barat', 'Bogor', 'BOGOR');
expectKab(jabar, '32-71', 'Jawa Barat', 'Bogor', 'KOTA BOGOR');
const ntt = provinceNode('NUSA TENGGARA TIMUR');
expectKab(ntt, '53-03', 'Nusa Tenggara Timur', 'Kupang', 'KUPANG');
expectKab(ntt, '53-71', 'Nusa Tenggara Timur', 'Kupang', 'KOTA KUPANG');

// Nama asli yang memuat kata "Kota" bukan otomatis sebuah kota administratif.
expectKab(provinceNode('KALIMANTAN SELATAN'), '63-02', 'Kalimantan Selatan', 'Kota Baru', 'KOTABARU');

// Atribut upstream salah/bernama lama ditautkan berdasarkan ID stabil.
expectKab(provinceNode('KALIMANTAN BARAT'), '61-71', 'Kalimantan Barat', 'Mempawah', 'KOTA PONTIANAK');
expectKab(provinceNode('PAPUA BARAT'), '91-12', 'Papua Barat', 'Manokwari', 'PEGUNUNGAN ARFAK');
expectKab(provinceNode('SULAWESI BARAT'), '76-05', 'Sulawesi Barat', 'Mamuju Utara', 'PASANGKAYU');

// Danau/waduk/hutan pada atlas bukan wilayah yang dapat diklik.
assert.strictEqual(resolver.kabFeatureType(feature('18-88', 'Lampung', 'Danau')), 'other');
assert.strictEqual(resolver.kabNodeFor(feature('18-88', 'Lampung', 'Danau'), provinceNode('LAMPUNG')), null);

// Variasi spasi dan satu salah ketik pada geometri kecamatan DIY.
const kecParent = (province, kab, names) => {
  const parentProvince = { name: province };
  return { name: kab, parent: parentProvince, anak: names.map(name => ({ name })) };
};
assert.strictEqual(kecNodeFor({ properties: { name: 'Bambang Lipuro' } }, kecParent('DAERAH ISTIMEWA YOGYAKARTA', 'BANTUL', ['BAMBANGLIPURO'])).name, 'BAMBANGLIPURO');
assert.strictEqual(kecNodeFor({ properties: { name: 'Plered' } }, kecParent('DAERAH ISTIMEWA YOGYAKARTA', 'BANTUL', ['PLERET'])).name, 'PLERET');
assert.strictEqual(kecNodeFor({ properties: { name: 'Kota Gede' } }, kecParent('DAERAH ISTIMEWA YOGYAKARTA', 'KOTA YOGYAKARTA', ['KOTAGEDE'])).name, 'KOTAGEDE');
assert.strictEqual(kecNodeFor({ properties: { name: 'Godeyan' } }, kecParent('DAERAH ISTIMEWA YOGYAKARTA', 'SLEMAN', ['GODEAN'])).name, 'GODEAN');
assert.strictEqual(kecNodeFor({ properties: { name: 'Kec. Ilir Barat I' } }, kecParent('SUMATERA SELATAN', 'KOTA PALEMBANG', ['ILIR BARAT I'])).name, 'ILIR BARAT I');
assert.strictEqual(kecNodeFor({ properties: { name: 'Ungaran' } }, kecParent('JAWA TENGAH', 'SEMARANG', ['UNGARAN BARAT', 'UNGARAN TIMUR'])), null);

// Salah ketik generik tidak boleh mengambil geometri milik kabupaten lain.
assert.strictEqual(kecNodeFor({ properties: { name: 'Sukmajaya' } }, kecParent('JAWA BARAT', 'BOGOR', ['SUKAJAYA'])), null);
assert.strictEqual(kecNodeFor({ properties: { name: 'Muara Batu' } }, kecParent('ACEH', 'KOTA LHOKSEUMAWE', ['MUARA SATU'])), null);
assert.strictEqual(kecNodeFor({ properties: { name: 'Muara Jawa' } }, kecParent('KALIMANTAN TIMUR', 'KUTAI BARAT', ['MUARA LAWA'])), null);
assert.strictEqual(kecNodeFor({ properties: { name: 'Muara Lawa' } }, kecParent('KALIMANTAN TIMUR', 'KUTAI KARTANEGARA', ['MUARA JAWA'])), null);

// Label lama SHP Kota Yogyakarta dan variasi nama kecamatannya tetap diterima,
// tetapi label kabupaten/kota lain tidak boleh lolos filter yurisdiksi.
const diyProvince = { name: 'DAERAH ISTIMEWA YOGYAKARTA' };
const kotaYogyakarta = { name: 'KOTA YOGYAKARTA', parent: diyProvince };
const kotaGede = {
  name: 'KOTAGEDE', parent: kotaYogyakarta, geoNames: ['KOTA GEDE'],
  anak: [{ name: 'PRENGGAN' }, { name: 'PURBAYAN' }, { name: 'REJOWINANGUN' }]
};
assert(desaResolver.sameKabLabel('KDY. YOGYAKART', kotaYogyakarta));
assert(!desaResolver.sameKabLabel('BANTUL', kotaYogyakarta));
assert(desaResolver.sameKecLabel('KOTA GEDE', kotaGede));
assert(!desaResolver.sameKecLabel('GODEAN', kotaGede));
assert.strictEqual(desaResolver.desaNodeFor({ properties: { name: 'Rejo Winangun' } }, kotaGede).name, 'REJOWINANGUN');
assert.strictEqual(desaResolver.desaNodeFor({ properties: { name: 'Prenggan' } }, kotaGede).name, 'PRENGGAN');
assert.strictEqual(desaResolver.desaNodeFor({ properties: { name: 'Prenggen' } }, kotaGede), null);

// Indeks kecamatan harus mempertahankan provinsi dan tipe KOTA pada key.
assert(Object.keys(kecIndex).every(key => key.includes('|')), 'ditemukan key kec_index global/legacy');
assert(Object.values(kecIndex).every(code => /^\d{4}$/.test(String(code))), 'kode GIS bukan empat digit');
assert.strictEqual(kecIndex['YOGYAKARTA|BANTUL'], '3402');
assert.strictEqual(kecIndex['YOGYAKARTA|KOTA YOGYAKARTA'], '3471');
assert.strictEqual(kecIndex['JAWA BARAT|BANDUNG'], '3206');
assert.strictEqual(kecIndex['JAWA BARAT|KOTA BANDUNG'], '3273');
assert.strictEqual(kecIndex['GORONTALO|KOTA GORONTALO'], '7171');
assert.strictEqual(kecIndex['BANTEN|KOTA SERANG'], '3220');
assert.strictEqual(kecIndex['KEPULAUAN BANGKA BELITUNG|BANGKA'], '1607');

console.log('geo_mapping.test.js: semua regresi pemetaan lulus');
