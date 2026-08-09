# Audit data Pemilu dan batas wilayah 2019

Dokumen ini merangkum audit yang dapat dibaca manusia. Inventaris per berkas,
SHA-256, total mentah per kolom, contoh anomali, dan rekonsiliasi keluaran ada
di `data/audit2019.json`. Audit GIS ditulis oleh `build_gis_data.py` ke
`data/gis/audit2019.json`.

## Hasil pemilu

Sumber yang diaudit adalah seluruh CSV di
`D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU`, bukan sampel
`src/` di repository ini.

| Kontes | CSV hasil | Rekaman valid masuk | Kecamatan tercakup | Desa/kelurahan tercakup | Rekaman hasil kosong |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilpres | 342 | 499.325 | 3.414 | 42.455 | 320 |
| DPR RI | 138 | 35.537 | 1.211 | 10.528 | 5.771 |
| DPRD provinsi | 734 | 813.336 | 7.331 | 83.528 | 79.093 |
| DPRD kabupaten/kota | 733 | 813.332 | 7.330 | 83.527 | 119.589 |
| **Total** | **1.947** | **2.161.530** | — | — | **204.773** |

Selain itu ada tujuh CSV referensi/pendukung. Jadi inventaris lengkap berisi
1.954 CSV dengan ukuran 1.068.772.711 byte. Keempat salinan
`dataprov-kec.csv` identik berdasarkan SHA-256.

### Rekonsiliasi

- Semua 1.947 nama berkas hasil ada dalam inventaris, termasuk 16 berkas DPR
  RI kosong dengan suffix 734–749.
- Rentang berkas lengkap adalah Pilpres 1–342, DPR RI 612–749, DPRD provinsi
  0–733, dan DPRD kabupaten/kota 0–732.
- Dari 2.161.531 rekaman fisik, 2.161.530 masuk ke artefak visualisasi. Satu
  pseudo-rekaman pada `Pilpres RI/data/datakpu-306.csv` hanya berisi byte NUL;
  rekaman itu tidak mempunyai ID, wilayah, TPS, atau angka hasil dan dicatat
  sebagai rusak, bukan diubah menjadi suara.
- Setiap ID unik di dalam kontes. Dua belas benturan nama-wilayah-TPS di
  Merlung mempunyai ID berbeda; semuanya dipertahankan dan agregasi memakai
  key wilayah komposit, bukan nama global.
- Penjumlahan seluruh potongan hasil desa tepat sama dengan indeks kecamatan.
  Checksum total suara setiap opsi juga dikunci oleh
  `tests/test_data_integrity.py`.
- Hierarki gabungan berisi 35 kelompok provinsi (34 provinsi 2019 dan
  `+Luar Negeri`), 644 unit kabupaten/kota atau luar negeri, 7.331 kecamatan
  atau unit luar negeri, dan 83.528 desa/kelurahan atau unit luar negeri.

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
