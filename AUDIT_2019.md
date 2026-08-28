# Audit Data Pemilu dan Batas Wilayah 2019

Dokumen ini menyajikan ringkasan audit data Pemilu dan batas wilayah 2019 dalam format yang mudah dipahami. Rincian teknis yang lengkap—termasuk inventaris per berkas, *checksum* SHA-256, kalkulasi data mentah per kolom, sampel anomali, serta rekonsiliasi keluaran—tersimpan di dalam `data/audit2019.json`. Sementara itu, log audit spasial (GIS) dihasilkan secara otomatis oleh `build_gis_data.py` ke dalam `data/gis/audit2019.json`.

## Hasil Pemilu

Data dihimpun dari dua sumber *scraping* utama dan diintegrasikan berdasarkan ID resmi wilayah KPU (bukan menggunakan pencocokan nama):

| Sumber | Cakupan & Peruntukan | Jalur Berkas Sumber (*Source Path*) |
| --- | --- | --- |
| *Scrape* KPU terdahulu (*legacy*) | DPR RI, DPRD Provinsi, DPRD Kabupaten/Kota, serta satu-satunya rujukan data DPT | `...\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU` |
| Ekspor KawalPemilu per provinsi | Pilpres | `...\json-kpu-2019\csv-per-provinsi` |
| *Dump node* hierarki KawalPemilu | Fondasi kode identitas wilayah (ID resmi KPU) | `...\json-kpu-2019\full-tps-kawalpemilu` |

Data Pilpres pada *scraping legacy* awalnya hanya mencakup 15 dari total 35 wilayah setingkat provinsi, sehingga peta visualisasi Pilpres nasional tidak dapat mencakup sebagian besar wilayah Indonesia. Oleh karena itu, data Pilpres digantikan seutuhnya oleh hasil ekspor KawalPemilu. Berkas sampel pada direktori `src/` di repositori ini bukan merupakan sumber data audit.

| Jenis Pemilihan | Berkas CSV Hasil | Baris Valid Masuk | Kecamatan Tercakup | Desa/Kelurahan Tercakup | Baris Tanpa Data Hasil |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilpres | 35 | 806.583 | 7.246 | 82.342 | 0 |
| DPR RI | 138 | 35.537 | 1.211 | 10.528 | 5.771 |
| DPRD Provinsi | 734 | 813.336 | 7.331 | 83.529 | 79.093 |
| DPRD Kabupaten/Kota | 733 | 813.332 | 7.330 | 83.528 | 119.589 |
| **Total** | **1.640** | **2.468.788** | — | — | **204.453** |

Selain berkas hasil di atas, terdapat 7 berkas CSV referensi/pendukung dan 342 CSV Pilpres *legacy* yang kini difungsikan khusus sebagai rujukan data DPT. Secara keseluruhan, inventaris data mencakup 1.989 berkas CSV (total 1.125.400.831 *byte*) serta 8.011 berkas *node* hierarki wilayah (26.200.573 *byte*). Berdasarkan verifikasi *checksum* SHA-256, keempat salinan berkas `dataprov-kec.csv` dipastikan identik secara biner.

### Perbandingan dengan Rekapitulasi Resmi KPU

| Indikator | Data Artefak Ini | Penetapan Resmi KPU | Rasio Kelengkapan |
| --- | ---: | ---: | ---: |
| Perolehan Suara Paslon 01 | 84.298.880 | 85.607.362 | 98,5% |
| Perolehan Suara Paslon 02 | 68.221.284 | 68.650.239 | 99,4% |
| Persentase (*Share*) 01 | 55,27% | 55,50% | — |

Di tingkat provinsi, rasio kelengkapan data mencapai 98–100% di seluruh wilayah **kecuali Papua** (Paslon 01: 71,1%, Paslon 02: 61,0%), mengingat sistem SITUNG KPU saat itu tidak pernah menyelesaikan pemindaian untuk distrik-distrik yang menerapkan sistem noken. Selain itu, data Pilpres untuk Kabupaten **ASMAT** (23 kecamatan) dan Kecamatan **PANTE BIDARI** (Aceh Timur) tidak tersedia sama sekali. Secara total, terdapat 85 kecamatan yang tidak memiliki data hasil Pilpres; seluruhnya telah didokumentasikan pada entri `coverage_gap.entries` di dalam `data/audit2019.json`. Ketiadaan data ini dicatat apa adanya secara transparan, tanpa pengisian data buatan (imputasi) maupun penghalusan angka.

### Standarisasi Identitas Wilayah

Kunci unik di setiap tingkatan wilayah menggunakan ID resmi KPU, termasuk pada level desa/kelurahan. Pada skema sebelumnya, kunci desa hanya mengandalkan urutan abjad di dalam kecamatan, sehingga posisinya rentan bergeser setiap kali data sumber mengalami perubahan atau pembaruan.

- Kolom `id` pada CSV *legacy* sebenarnya merupakan rangkaian (*concatenation*) dari kode ID resmi berjenjang:
  `1149217531776900003704` = `1` · `1492` · `1753` · `1776` · `900003704`.
  Mengingat panjang tiap segmen kode tidak seragam, setiap awalan kode (*prefix*) dicocokkan ke dalam hierarki pohon wilayah KPU. Karena kombinasi angka pendek bisa menyerupai awalan angka panjang (contohnya `12920` di Sumatera Barat yang dapat keliru terurai sebagai `1`+`2`+`9`+`20` di Aceh), sistem menggunakan data kecamatan pada baris yang bersangkutan sebagai acuan pemecah ambiguitas, sedangkan pencocokan nama desa hanya menjadi langkah terakhir (*fallback*). Melalui pendekatan ini, seluruh baris data berhasil diuraikan (*parsed*) 100% tanpa kegagalan.
- Berkas ekspor KawalPemilu sudah memuat `id_wilayah` secara langsung, dan seluruh 82.342 entri berhasil dipetakan (*resolved*) dengan sempurna.
- Struktur pohon hierarki KPU (35 wilayah setingkat provinsi, 644 kabupaten/kota/perwakilan LN, dan 7.331 kecamatan) divalidasi silang secara ketat dengan berkas independen `dataprov-kec.csv`. Proses *build* akan langsung digagalkan jika ditemukan ketidaksesuaian.
- Untuk nama tampilan (*display name*), ejaan pada CSV hasil tetap dipertahankan (bukan ejaan dari pohon hierarki). Hal ini dilakukan karena *pipeline* GIS sudah menggunakan ejaan tersebut untuk pencocokan batas geometri, serta untuk menghindari kesalahan ketik pada pohon KPU (misalnya `JOHAN PAHWALAN` yang seharusnya `JOHAN PAHLAWAN`). Sebanyak 137 variasi ejaan telah dicatat secara lengkap pada daftar `name_aliases`.

### Rekonsiliasi Data

- Seluruh 1.640 berkas hasil pemilihan tercatat lengkap di dalam inventaris, termasuk 16 berkas data DPR RI kosong dengan sufiks penomoran 734–749.
- Penamaan berkas *legacy* meliputi DPR RI (rentang 612–749), DPRD Provinsi (0–733), dan DPRD Kabupaten/Kota (0–732), sedangkan berkas Pilpres dikelompokkan dan dinamai per provinsi.
- Sebanyak 2.468.788 baris data hasil pemilihan berhasil diproses ke dalam artefak visualisasi tanpa ada yang tertolak. Satu baris semu (*pseudo-record*) pada `Pilpres RI/data/datakpu-306.csv` yang hanya berisi *byte* NUL kini dicatat sebagai data rusak pada `dpt_backfill.counts.invalid_record`, dan berkas tersebut saat ini hanya difungsikan sebagai referensi pelengkap DPT.
- Setiap ID dipastikan unik di dalam masing-masing jenis pemilihan. Kasus tumpang-tindih (*conflict*) pada 12 TPS di wilayah Merlung terselesaikan secara otomatis karena identitas kini mengacu pada ID desa resmi (bukan teks nama), sehingga dua desa yang sama-sama bernama `MERLUNG` (kode 16891 dan 90554) diperlakukan sebagai dua entitas (*node*) yang terpisah.
- Akumulasi penjumlahan dari seluruh pecahan data tingkat desa terbukti persis sama dengan angka indeks di tingkat kecamatan. Keabsahan total suara untuk setiap opsi/paslon juga dikunci dan diverifikasi oleh pengujian `tests/test_data_integrity.py`.
- Hasil agregasi tingkat kecamatan dari proses *build* dicocokkan ulang dengan berkas bawaan `agregasi_kecamatan.csv`: 7.246 dari 7.246 kecamatan (100%) cocok sempurna.
- Hierarki gabungan akhir mencakup 35 kelompok provinsi (34 provinsi dalam negeri periode 2019 ditambah unit `+Luar Negeri`), 644 entitas kabupaten/kota atau perwakilan luar negeri, 7.331 kecamatan atau unit luar negeri, serta 83.529 desa/kelurahan atau unit TPS luar negeri.

### DPT dan Angka Partisipasi Pemilih

Karena berkas ekspor KawalPemilu tidak menyertakan kolom data pemilih terdaftar, informasi DPT dan pengguna hak pilih dipulihkan (*backfilled*) per TPS dari data *scraping legacy* menggunakan kunci gabungan `(id_kelurahan, nomor_tps)`. Format penomoran TPS dinormalisasi terlebih dahulu karena sumber data *legacy* menuliskan format seperti `TPS 01`, sedangkan data ekspor menggunakan format angka murni `1`.

- Dari 499.325 TPS *legacy* yang diindeks, sebanyak 497.941 TPS berhasil dipasangkan dengan tepat.
- Sebanyak 308.642 dari total 806.583 TPS Pilpres tidak memiliki sumber data DPT pelengkap.
- Tingkat cakupan pemulihan DPT mencapai 100% pada 15 provinsi yang memang tersedia dalam *scrape legacy*, dan 0% untuk provinsi di luar itu.

Aturan validasi diterapkan secara konsisten: kelima kolom metadata partisipasi hanya akan diikutsertakan ke dalam angka akumulasi antarmuka jika baris rekaman tersebut konsisten secara internal. Oleh karena itu, TPS yang tidak memiliki data DPT pelengkap tidak akan dihitung ke dalam persentase partisipasi—sesuai dengan kriteria `validated-tps` yang telah ditetapkan sejak awal. Perlu diperhatikan bahwa **angka partisipasi Pilpres pada visualisasi ini bukan merupakan agregat nasional penuh**, dan status cakupan data ini dicantumkan secara transparan pada panel informasi aplikasi.

### Penanganan Data Kosong, Angka Nol, dan Anomali

Seluruh kolom perolehan suara disimpan dan diakumulasikan apa adanya sesuai berkas CSV asli; *pipeline* tidak memanipulasi data ataupun mengarang angka buatan. Sebanyak 204.773 baris data yang seluruh kolom perolehan suaranya kosong tetap dimasukkan ke dalam basis data, namun diberi label penanda melalui statistik `blank-tps`. Dengan pemisahan ini, sistem dapat membedakan secara tegas antara data yang tidak terisi (*blank*) dengan perolehan suara yang memang bernilai nol (`0`), baik pada tampilan panel, tabel rincian, maupun berkas ekspor CSV.

Lima atribut metadata partisipasi (`total-pemilih`, `total-pengguna`, `suara-total`, `suara-sah`, dan `suara-tidak-sah`) hanya disertakan dalam kalkulasi tampilan jika memenuhi kriteria konsistensi internal pada baris bersangkutan. Baris data di luar wilayah Papua dan Luar Negeri yang memiliki nilai metadata di atas 1.000 dikarantina dari perhitungan partisipasi karena terindikasi kuat merupakan kesalahan penggabungan teks angka (*concatenation error*). Selain itu, aturan validasi mensyaratkan jumlah pengguna hak pilih tidak boleh melampaui jumlah pemilih terdaftar, sehingga persentase partisipasi agregat tidak akan melebihi 100%.

Data mentah perolehan suara tetap disajikan secara utuh dan transparan. Terdapat 88 rekaman TPS di luar Papua dan Luar Negeri yang mencatat suara salah satu opsi di atas 1.000; metrik `outlier-vote-tps` menampilkan TPS ini secara transparan pada panel, tabel, dan ekspor, disertai peringatan bahwa angka anomali pada data mentah tersebut berpotensi mengubah penentuan pemenang di tingkat lokal. Seluruh nilai ekstrem dan titik lokasinya dicatat secara rinci di dalam audit JSON.

| Jenis Pemilihan | Metadata TPS Valid | Metadata TPS Anomali/Kosong | Σ Opsi ≠ Suara Sah |
| --- | ---: | ---: | ---: |
| Pilpres | 470.067 | 29.258 | 8.106 |
| DPR RI | 26.439 | 9.098 | 6.267 |
| DPRD Provinsi | 670.649 | 142.687 | 203.254 |
| DPRD Kabupaten/Kota | 634.928 | 178.404 | 170.597 |

Kolom "Metadata TPS Anomali/Kosong" merujuk pada metrik `invalid_stats_row`, di mana baris data yang kosong merupakan bagian (*subset*) di dalamnya. Beberapa temuan anomali ekstrem antara lain entri `suara-tidak-sah=305151154` pada data DPRD Provinsi dan `total-pemilih=249124` pada data DPRD Kabupaten/Kota. Selain itu, satu rekaman TPS di Balai Gurah (DPRD Provinsi) memuat perolehan suara sebesar 91.827 dan 84.452. Nilai-nilai tersebut tetap dapat ditinjau apa adanya sebagai data mentah dengan indikator peringatan, sehingga metadata anomali tidak mendistorsi kalkulasi angka partisipasi pada antarmuka pengguna.

### Batasan Cakupan Sumber Data

Meskipun seluruh berkas CSV yang tersedia berhasil dimuat, hal ini tidak berarti data mentah hasil *scraping* mencakup seluruh wilayah nasional secara merata untuk setiap jenis pemilihan:
- **Pilpres (*legacy*):** Hanya mencakup 15 kelompok provinsi (sebelum digantikan oleh ekspor KawalPemilu).
- **DPR RI:** Hanya tersedia untuk 7 kelompok provinsi.
- **DPRD Provinsi:** Mencakup seluruh hierarki wilayah secara nasional.
- **DPRD Kabupaten/Kota:** Mencakup seluruh wilayah, kecuali 4 TPS di Harare (Luar Negeri) yang hanya tercatat pada *batch* DPRD Provinsi.
- **DPD:** Tidak tersedia berkas CSV sumber sama sekali, sehingga visualisasi tidak menyediakan tab maupun data estimasi fiktif untuk pemilihan DPD.

## Batas Wilayah dan Data Spasial

Hierarki wilayah KPU dari berkas CSV menjadi fondasi utama (*spine*) sekaligus rujukan atribut `properties.key` pada seluruh berkas GeoJSON. Sumber data geometri spasial dipilih berdasarkan kedekatan periode waktunya dengan penyelenggaraan Pemilu 2019, bukan semata-mata memilih versi tanggal berkas yang paling baru:

1. **Arsip Kemendagri Semester I 2018** untuk tingkat kabupaten/kota dan kecamatan. Batas wilayah provinsi dibentuk dari penggabungan (*union*) seluruh kabupaten/kota yang berada di bawah hierarki KPU 2019 terkait.
2. **GPKG Kemendagri Semester I 2020** untuk tingkat desa/kelurahan.
3. **Jembatan kode (*code bridge*) resmi** yang memetakan identitas layer BIG kembali ke geometri desa berbasis Kemendagri 2017/2020 di dalam kabupaten/kota KPU yang sama.
4. ***Shapefile* repositori 13 Juni 2023** sebagai data cadangan (*fallback*) untuk kabupaten/kota dan kecamatan yang belum terpetakan.
5. **Poligon BIG 26 Maret 2020** untuk desa yang tidak berhasil dipetakan melalui *code bridge*.
6. **Poligon BIG 28 Mei 2023** sebagai opsi cadangan paling akhir.

Kedua layer spasial dari Badan Informasi Geospasial (BIG) hanya digunakan apabila atribut Undang-Undang Pembentukan Peraturan (UUPP) pada fiturnya bertarikh maksimal tahun 2019 atau tidak mencantumkan tahun. Khusus untuk data ekstrak Maret 2020, penyaringan dilakukan lebih ketat: 16 baris data yang memiliki UUPP setelah tahun 2019 langsung dibuang sebelum proses pencocokan, sehingga tidak dapat dijadikan poligon maupun rujukan *bridge*.

Pendekatan ini tidak diklaim sebagai representasi batas wilayah mutlak yang 100% presisi pada hari pemungutan suara 2019. Setiap penggunaan jalur *fallback*, nama alias, pencocokan konservatif, serta entitas wilayah tanpa data geometri dicatat secara transparan di dalam `data/gis/audit2019.json` (unit `+Luar Negeri` secara alami berstatus nonspasial).

| Tingkat Wilayah Domestik | Kecocokan Identitas Langsung | Total Fitur GeoJSON | Target Wilayah 2019 | Entitas Tanpa Geometri |
| --- | ---: | ---: | ---: | ---: |
| Provinsi | 34 | 34 | 34 | 0 |
| Kabupaten/Kota | 514 | 514 | 514 | 0 |
| Kecamatan | 7.166 | 7.201 | 7.201 | 0 |
| Desa/Kelurahan | 81.046 | 81.046 | 83.398 | 2.352 |

Sebanyak 35 poligon kecamatan tambahan dibentuk dari penggabungan (*union*) seluruh desa cakupannya yang berhasil dipetakan. Selain itu, 1.034 desa memanfaatkan *code bridge* ke geometri historis sehingga bentuk poligonnya tetap konsisten dengan data dasar Kemendagri 2017/2020. Adapun sisa wilayah yang menggunakan data cadangan (*fallback*) poligon BIG berjumlah 185 desa, yang mayoritas bersumber dari ekstrak data yang lebih lama:

| Sumber Poligon BIG | Jumlah Desa | UUPP ≤ 2019 | UUPP Tidak Diketahui | UUPP > 2019 |
| --- | ---: | ---: | ---: | ---: |
| BIG 26 Maret 2020 | 131 | 130 | 1 | 0 |
| BIG 28 Mei 2023 | 54 | 48 | 6 | 0 |

*Pipeline* pemrosesan sengaja tidak menggunakan algoritma perkiraan seperti *edit distance* atau *fuzzy matching* guna mencegah kesalahan relasi wilayah. Entitas wilayah yang tidak memiliki poligon geometri tetap dapat diakses melalui tabel data, pencarian, panel informasi, dan ekspor CSV; tampilan *grid* nonspasial akan otomatis menggantikan visualisasi peta jika seluruh entitas anak di bawahnya tidak memiliki data spasial. Seluruh 29 berkas sumber terpilih (total 2.759.675.829 *byte*) telah dicatat nilai *checksum* SHA-256-nya. Proses *build* memasang 7.750 berkas GeoJSON secara transaksional dengan standar proyeksi EPSG:4326, batas wilayah nasional (*bounding box*), hasil validasi topologi geometri, serta pencatatan *hash* hierarki keluaran pada laporan audit.

### Sumber Data Spasial yang Sengaja Dikecualikan

Tiga kumpulan data pada direktori `SHP GIS/` sengaja tidak disertakan ke dalam *pipeline* berdasarkan pertimbangan teknis berikut:

| Sumber Berkas | Deskripsi Isi | Pertimbangan Teknis |
| --- | --- | --- |
| `RBI10K_ADMINISTRASI_DESA_20230928.gdb` | 83.486 poligon desa (rilisan 28 September 2023) | Versi data terlalu baru dibandingkan layer BIG Mei 2023 yang sudah menjadi batas toleransi terakhir, sehingga tidak relevan dengan kondisi 2019. Selain itu, sistem koordinatnya menggunakan *compound CRS* (WGS 84 + EGM2008) dengan tipe geometri 3D *measured* yang tidak kompatibel dengan peta web 2D. |
| `RBI50K_ADMINISTRASI_KABKOTA_20230907.gdb` | Batas kabupaten/kota (rilisan 7 September 2023) | Merupakan data tahun 2023 dan struktur layer utamanya berupa garis batas (*linestring*), bukan poligon wilayah administratif. |
| `Peta Batas Administrasi ... /seamless_bad123_rev130723_1.shp` | 1.298 segmen garis (revisi 13 Juli 2023) | Berupa geometri garis murni (*LineString*) tahun 2023, sehingga tidak dapat digunakan sebagai poligon visualisasi *choropleth* tanpa proses rekonstruksi buatan yang berisiko mengubah batas asli. |

## Menjalankan Proses Audit dan Pengujian

Untuk membangun ulang data dan memverifikasi integritasnya secara menyeluruh, jalankan perintah berikut:

```powershell
.\.venv\Scripts\python.exe build_2019_data.py
.\.venv\Scripts\python.exe build_gis_data.py
.\.venv\Scripts\python.exe tests\test_data_integrity.py
.\.venv\Scripts\python.exe tests\test_gis_integrity.py
.\.venv\Scripts\python.exe tests\test_gis_install_transaction.py
.\.venv\Scripts\python.exe tests\test_http_smoke.py
node tests\geo_mapping.test.js
```

Seluruh data keluaran dibangun terlebih dahulu melalui direktori *staging*. Skrip instalasi GIS memperbarui berkas keluaran secara atomik (*transactional install*), menerbitkan laporan audit pada tahap akhir sebagai penanda komit data, dan secara otomatis memulihkan (*rollback*) seluruh berkas lama ke kondisi semula jika terjadi kegagalan pada salah satu proses.
