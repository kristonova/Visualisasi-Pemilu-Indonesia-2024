# Audit data Pemilu dan batas wilayah 2019

Dokumen ini merangkum audit yang dapat dibaca manusia. Inventaris per berkas,
SHA-256, total mentah per kolom, contoh anomali, dan rekonsiliasi keluaran ada
di `data/audit2019.json`. Audit GIS ditulis oleh `build_gis_data.py` ke
`data/gis/audit2019.json`.

## Hasil pemilu

Dua scrape menjadi sumber, digabung lewat ID wilayah KPU resmi, bukan lewat
nama:

| Sumber | Peran | Akar |
| --- | --- | --- |
| Scrape KPU legacy | DPR RI, DPRD provinsi, DPRD kabupaten/kota; sekaligus satu-satunya pemasok DPT | `...\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU` |
| Ekspor KawalPemilu per provinsi | Pilpres | `...\json-kpu-2019\csv-per-provinsi` |
| Dump node wilayah KawalPemilu | Tulang punggung identitas (ID wilayah KPU) | `...\json-kpu-2019\full-tps-kawalpemilu` |

Batch Pilpres pada scrape legacy hanya pernah mencakup 15 dari 35 kelompok
provinsi, sehingga peta Pilpres nasional menutupi kurang dari separuh negeri.
Ekspor KawalPemilu menggantikannya. Sampel `src/` di repository ini bukan
sumber audit.

| Kontes | CSV hasil | Rekaman valid masuk | Kecamatan tercakup | Desa/kelurahan tercakup | Rekaman hasil kosong |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilpres | 35 | 806.583 | 7.246 | 82.342 | 0 |
| DPR RI | 138 | 35.537 | 1.211 | 10.528 | 5.771 |
| DPRD provinsi | 734 | 813.336 | 7.331 | 83.529 | 79.093 |
| DPRD kabupaten/kota | 733 | 813.332 | 7.330 | 83.528 | 119.589 |
| **Total** | **1.640** | **2.468.788** | — | — | **204.453** |

Selain itu ada tujuh CSV referensi/pendukung dan 342 CSV Pilpres legacy yang
kini hanya berperan sebagai pemasok DPT. Inventaris lengkap berisi 1.989 CSV
berukuran 1.125.400.831 byte, ditambah 8.011 berkas node hierarki
(26.200.573 byte). Keempat salinan `dataprov-kec.csv` identik berdasarkan
SHA-256.

### Perbandingan dengan hasil resmi KPU

| Angka | Artefak ini | Resmi KPU | Rasio |
| --- | ---: | ---: | ---: |
| Suara 01 | 84.298.880 | 85.607.362 | 98,5% |
| Suara 02 | 68.221.284 | 68.650.239 | 99,4% |
| Share 01 | 55,27% | 55,50% | — |

Per provinsi rasionya 98–100% di semua wilayah **kecuali Papua** (01: 71,1%,
02: 61,0%). SITUNG tidak pernah merampungkan distrik sistem noken. Kabupaten
**ASMAT** (23 kecamatan) dan kecamatan **PANTE BIDARI** (Aceh Timur) tidak ada
sama sekali; total 85 kecamatan tanpa hasil Pilpres, seluruhnya terdaftar pada
`coverage_gap.entries` di `data/audit2019.json`. Kekosongan ini dinyatakan,
bukan diisi atau diperhalus.

### Identitas wilayah

Kunci setiap tingkat adalah ID wilayah KPU resmi, termasuk kelurahan. Kunci
desa sebelumnya hanya posisi alfabetis di dalam kecamatan, sehingga bergeser
setiap kali data sumber berubah.

- Kolom `id` pada CSV legacy ternyata sudah merupakan rangkaian ID resmi:
  `1149217531776900003704` = `1`·`1492`·`1753`·`1776`·`900003704`. Karena
  panjang tiap bagian tidak tetap, setiap prefiks diuji terhadap indeks pohon.
  Kode pendek dapat menyerupai awalan kode panjang — `12920` (Sumatera Barat)
  juga terbaca sebagai `1`+`2`+`9`+`20` di Aceh — sehingga pemecah ambiguitas
  adalah kecamatan pada baris yang sama, dan nama desa hanya jadi upaya
  terakhir. Tidak ada satu pun baris yang gagal diuraikan.
- Ekspor KawalPemilu membawa `id_wilayah` langsung; seluruh 82.342 nilainya
  resolve tanpa kegagalan.
- Pohon KPU (35 provinsi, 644 kabupaten/kota, 7.331 kecamatan) wajib cocok
  persis dengan `dataprov-kec.csv` yang independen; build gagal bila tidak.
- Nama tampilan tetap memakai ejaan CSV hasil, bukan ejaan pohon, karena
  ejaan itulah yang sudah dipakai pipeline GIS untuk mencocokkan geometri dan
  karena pohon memuat ejaan yang lebih buruk (`JOHAN PAHWALAN` untuk
  `JOHAN PAHLAWAN`). Seluruh 137 perbedaan ejaan tercatat pada `name_aliases`.

### Rekonsiliasi

- Seluruh 1.640 nama berkas hasil ada dalam inventaris, termasuk 16 berkas DPR
  RI kosong dengan suffix 734–749.
- Rentang berkas legacy adalah DPR RI 612–749, DPRD provinsi 0–733, dan DPRD
  kabupaten/kota 0–732. Berkas Pilpres dinamai per provinsi.
- Seluruh 2.468.788 rekaman hasil masuk ke artefak visualisasi; tidak ada yang
  ditolak. Satu pseudo-rekaman pada `Pilpres RI/data/datakpu-306.csv` hanya
  berisi byte NUL; berkas itu kini hanya dipakai sebagai pemasok DPT, dan
  rekaman tersebut dicatat rusak pada `dpt_backfill.counts.invalid_record`.
- Setiap ID unik di dalam kontes. Dua belas benturan nama-wilayah-TPS di
  Merlung hilang dengan sendirinya: identitas kini ID desa, bukan nama, dan
  kedua desa bernama `MERLUNG` (kode 16891 dan 90554) menjadi node terpisah.
- Penjumlahan seluruh potongan hasil desa tepat sama dengan indeks kecamatan.
  Checksum total suara setiap opsi juga dikunci oleh
  `tests/test_data_integrity.py`.
- Agregat kecamatan hasil build dicocokkan dengan `agregasi_kecamatan.csv`
  bawaan dataset: 7.246 dari 7.246 kecamatan sama persis.
- Hierarki gabungan berisi 35 kelompok provinsi (34 provinsi 2019 dan
  `+Luar Negeri`), 644 unit kabupaten/kota atau luar negeri, 7.331 kecamatan
  atau unit luar negeri, dan 83.529 desa/kelurahan atau unit luar negeri.

### DPT dan partisipasi

Ekspor KawalPemilu tidak memuat kolom pemilih terdaftar. DPT dan pengguna hak
pilih karena itu dipulihkan per TPS dari scrape legacy dengan kunci
`(id_kelurahan, nomor_tps)`; nomor TPS dinormalisasi karena sumber legacy
menulis `TPS 01` sementara ekspor menulis `1`.

- 499.325 TPS legacy terindeks, 497.941 di antaranya menemukan pasangan.
- 308.642 dari 806.583 TPS Pilpres tidak punya pemasok DPT.
- Cakupannya 100% di dalam 15 provinsi yang memang ada pada scrape legacy, dan
  nol di luar itu.

Gerbang validasi tidak diubah: kelima metadata partisipasi hanya masuk total
tampilan bila satu rekaman konsisten secara internal. TPS tanpa pemasok DPT
karena itu tidak pernah menyumbang partisipasi — sesuai makna `validated-tps`
yang berlaku sejak awal. **Partisipasi Pilpres bukan angka nasional**, dan
panel serta catatan cakupan menyatakannya.

### Arti kosong, nol, dan anomali

Semua kolom perolehan suara disimpan dan dijumlahkan sebagaimana ada di CSV;
pipeline tidak membuat data sintetis dan tidak "memperbaiki" angka sumber.
Sebanyak 204.773 rekaman dengan seluruh kolom hasil kosong tetap masuk, tetapi
ditandai melalui statistik `blank-tps`. Karena itu kosong dapat dibedakan dari
angka nol yang benar-benar tertulis, termasuk pada panel, tabel, dan ekspor
CSV.

Lima metadata partisipasi (`total-pemilih`, `total-pengguna`, `suara-total`,
`suara-sah`, dan `suara-tidak-sah`) hanya masuk ke total tampilan bila satu
rekaman konsisten secara internal. Rekaman non-Papua/non-luar-negeri dengan
nilai metadata di atas 1.000 juga dikarantina dari total partisipasi karena
sering merupakan angka hasil konkatenasi. Validasi juga mewajibkan pengguna
hak pilih tidak melebihi pemilih terdaftar, sehingga agregat partisipasi tidak
melewati 100%.

Suara opsi aslinya tetap tersedia. Sebanyak 88 rekaman di luar Papua/luar
negeri mempunyai salah satu suara opsi di atas 1.000; statistik
`outlier-vote-tps` membuatnya terlihat di panel, tabel, dan ekspor, dengan
peringatan bahwa angka mentah itu dapat mengubah pemenang lokal. Total mentah
dan lokasi nilai ekstrem tetap dicatat dalam audit JSON.

| Kontes | Metadata TPS valid | Metadata TPS anomali/blank | Σ opsi ≠ suara sah |
| --- | ---: | ---: | ---: |
| Pilpres | 470.067 | 29.258 | 8.106 |
| DPR RI | 26.439 | 9.098 | 6.267 |
| DPRD provinsi | 670.649 | 142.687 | 203.254 |
| DPRD kabupaten/kota | 634.928 | 178.404 | 170.597 |

Kolom “metadata anomali/blank” mengikuti `invalid_stats_row`; jumlah baris
kosong adalah subsetnya. Contoh ekstrem antara lain
`suara-tidak-sah=305151154` pada satu rekaman DPRD provinsi dan
`total-pemilih=249124` pada satu rekaman DPRD kabupaten/kota. Satu rekaman
DPRD provinsi Balai Gurah juga berisi suara opsi 91.827 dan 84.452. Nilai
tersebut terlihat dan diperingatkan sebagai data mentah; metadata ekstrem tidak
mendistorsi partisipasi pada UI.

### Batas cakupan sumber

“Semua CSV masuk” tidak berarti scrape sumbernya lengkap secara nasional untuk
setiap kontes. Pilpres yang tersedia hanya mencakup 15 kelompok provinsi dan
DPR RI tujuh kelompok provinsi. DPRD provinsi mencakup seluruh hierarki;
DPRD kabupaten/kota tidak mempunyai empat TPS Harare yang hanya ada pada batch
DPRD provinsi. Tidak ada CSV DPD, sehingga visualisasi tidak mengarang tab atau
hasil DPD.

## Batas wilayah

Hierarki KPU pada CSV menjadi spine dan sumber `properties.key` seluruh
GeoJSON. Sumber geometri dipilih menurut kedekatan waktunya dengan Pemilu 2019,
bukan semata-mata menurut tanggal file terbaru:

1. arsip Kemendagri semester I 2018 untuk kabupaten/kota dan kecamatan;
   batas provinsi diturunkan dari union seluruh kabupaten/kota anak pada
   hierarki KPU 2019;
2. GPKG Kemendagri semester I 2020 untuk desa/kelurahan;
3. code bridge resmi yang unik dari identitas layer BIG kembali ke geometri
   desa berbasis 2017/2020 dalam kabupaten KPU yang sama;
4. shapefile repository 13 Juni 2023 untuk fallback kabupaten/kota dan
   kecamatan yang belum cocok;
5. polygon BIG 26 Maret 2020 untuk desa yang bridge-nya gagal; dan
6. polygon BIG 28 Mei 2023 sebagai pilihan terakhir.

Kedua layer BIG hanya dipakai bila UUPP fiturnya paling lambat 2019 atau tidak
mencantumkan tahun. Ekstrak Maret 2020 diperlakukan lebih ketat karena
keberadaannya dalam build ini semata-mata karena kedekatan waktu: 16 baris
sumbernya yang ber-UUPP pasca-2019 dibuang sebelum pencocokan, sehingga tidak
dapat menjadi poligon maupun identitas bridge.

Pemilihan ini tidak diklaim sebagai snapshot presisi pada hari pemungutan
suara. Setiap fallback, alias, kecocokan konservatif, dan node tanpa geometri
harus tercantum dalam `data/gis/audit2019.json`; unit `+Luar Negeri` memang
nonspasial.

| Tingkat domestik | Cocok identitas | Fitur GeoJSON | Target 2019 | Tanpa geometri keluaran |
| --- | ---: | ---: | ---: | ---: |
| Provinsi | 34 | 34 | 34 | 0 |
| Kabupaten/kota | 514 | 514 | 514 | 0 |
| Kecamatan | 7.166 langsung | 7.201 | 7.201 | 0 |
| Desa/kelurahan | 81.046 | 81.046 | 83.398 | 2.352 |

Tiga puluh lima geometri kecamatan tambahan berasal dari union seluruh desa
anak yang berhasil dipetakan. Sebanyak 1.034 desa memakai code bridge unik ke
geometri historis, sehingga poligonnya tetap berasal dari basis Kemendagri
2017/2020. Sisa fallback yang benar-benar memakai poligon BIG berjumlah 185
dan didominasi ekstrak yang lebih tua:

| Sumber poligon BIG | Desa | UUPP ≤ 2019 | UUPP tidak diketahui | UUPP > 2019 |
| --- | ---: | ---: | ---: | ---: |
| BIG 26 Maret 2020 | 131 | 130 | 1 | 0 |
| BIG 28 Mei 2023 | 54 | 48 | 6 | 0 |

Pipeline tidak memakai edit distance atau fuzzy matching; node tanpa geometri
tetap tersedia melalui tabel, pencarian, panel, dan ekspor, sedangkan grid
nonspasial menggantikan peta bila seluruh anak aktif tidak memiliki poligon.
Seluruh 29 berkas sumber terpilih (2.759.675.829 byte)
direkam dengan SHA-256. Build memasang 7.750 berkas GeoJSON secara
transaksional dengan kontrak EPSG:4326, bbox nasional, hasil validasi setiap
geometri, dan hash pohon keluaran di audit.

### Sumber yang sengaja tidak dipakai

Tiga koleksi dalam `SHP GIS/` tidak masuk pipeline, dan alasannya bukan
kelalaian:

| Sumber | Isi | Alasan |
| --- | --- | --- |
| `RBI10K_ADMINISTRASI_DESA_20230928.gdb` | 83.486 poligon desa, 28 September 2023 | Lebih baru daripada layer BIG Mei 2023 yang sudah menjadi pilihan terakhir, sehingga tidak menambah kedekatan ke 2019; CRS-nya juga compound WGS 84 + EGM2008 height dengan geometri 3D measured. |
| `RBI50K_ADMINISTRASI_KABKOTA_20230907.gdb` | Batas kabupaten/kota, 7 September 2023 | Vintage 2023 dan layer utamanya garis batas, bukan poligon wilayah. |
| `Peta Batas Administrasi ... /seamless_bad123_rev130723_1.shp` | 1.298 segmen garis, revisi 13 Juli 2023 | Geometri LineString murni dan vintage 2023; tidak dapat menjadi area choropleth tanpa poligonisasi yang mengarang batas. |

## Menjalankan audit

```powershell
.\.venv\Scripts\python.exe build_2019_data.py
.\.venv\Scripts\python.exe build_gis_data.py
.\.venv\Scripts\python.exe tests\test_data_integrity.py
.\.venv\Scripts\python.exe tests\test_gis_integrity.py
.\.venv\Scripts\python.exe tests\test_gis_install_transaction.py
.\.venv\Scripts\python.exe tests\test_http_smoke.py
node tests\geo_mapping.test.js
```

Keluaran data dibangun melalui staging; installer GIS mengganti setiap berkas
secara atomik, menerbitkan audit sebagai penanda commit terakhir, dan
memulihkan seluruh berkas lama bila satu penggantian gagal.
