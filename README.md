# Visualisasi Hasil Pemilu Indonesia 2019

Aplikasi web statis untuk menjelajahi hasil Pemilu Indonesia 2019 dari tingkat nasional hingga kelurahan/desa. Seluruh angka yang ditampilkan berasal dari CSV hasil scraping KPU yang tersedia; aplikasi tidak membuat hasil sintetis, tidak mengimputasi wilayah yang tidak tercakup, dan tidak mencocokkan hasil berdasarkan nama wilayah yang ambigu.

**Dashboard live:** [kristonova.github.io/Visualisasi-Pemilu-Indonesia-2024](https://kristonova.github.io/Visualisasi-Pemilu-Indonesia-2024/)

Audit teknis yang lebih rinci tersedia di [`AUDIT_2019.md`](AUDIT_2019.md), [`data/audit2019.json`](data/audit2019.json), dan [`data/gis/audit2019.json`](data/gis/audit2019.json).

Visualisasi memuat empat kontes yang benar-benar tersedia dalam kumpulan sumber:

- Pilpres;
- DPR RI;
- DPRD Provinsi; dan
- DPRD Kabupaten/Kota.

Tidak ada tab DPD karena kumpulan sumber tidak memiliki CSV hasil DPD. Berkas `pemilu-2024.html` dipertahankan sebagai nama entry lama, tetapi isinya identik dengan `index.html` dan seluruh antarmukanya menampilkan Pemilu 2019.

## Fitur

- Drill-down Nasional → Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa.
- Peta GeoJSON lokal dengan resolver eksak melalui `properties.key`.
- Fallback grid jika geometri untuk suatu tingkat tidak tersedia.
- Mode warna pemenang, margin, perolehan opsi tertentu, dan partisipasi tervalidasi.
- Penanganan eksplisit untuk hasil seri, hasil tidak tersedia, TPS dengan hasil kosong, dan metadata TPS anomali.
- Pencarian seluruh tingkat wilayah, breadcrumb, tooltip, panel analisis, dan tabel yang menampilkan seluruh opsi/partai.
- Lazy loading hasil desa per provinsi dan geometri per wilayah agar startup tetap ringan.
- Ekspor CSV UTF-8 untuk anak wilayah aktif, termasuk indikator ketersediaan rekaman, `blank-tps`, dan `outlier-vote-tps`.

Pintasan keyboard:

| Tombol | Fungsi |
| --- | --- |
| `1`–`4` | Memilih kontes |
| `/` | Memfokuskan pencarian |
| `Esc` atau `Backspace` | Naik satu tingkat wilayah |

## Audit sumber hasil pemilu

Dua scrape menjadi sumber, digabung lewat **ID wilayah KPU resmi**, bukan lewat nama. Scrape KPU legacy memasok DPR RI dan kedua DPRD serta menjadi satu-satunya pemasok DPT; ekspor KawalPemilu per provinsi memasok Pilpres, karena batch Pilpres pada scrape legacy hanya pernah mencakup 15 dari 35 kelompok provinsi.

Pipeline menginventarisasi **1.989 CSV** berukuran total 1.125.400.831 byte, ditambah 8.011 berkas node hierarki (26.200.573 byte):

- 1.640 CSV hasil;
- 342 CSV Pilpres legacy yang kini hanya memasok DPT;
- 7 CSV referensi/pendukung; dan
- 2.468.788 rekaman hasil valid yang seluruhnya masuk ke artefak visualisasi, tanpa satu pun ditolak.

Sebanyak **204.453 rekaman valid memiliki seluruh kolom hasil kosong**. Rekaman tersebut tetap dihitung sebagai rekaman sumber dan disimpan melalui statistik `blank-tps`; kolom kosong tidak dipresentasikan sebagai angka nol yang dilaporkan. Satu pseudo-record berisi karakter NUL dicatat pada `dpt_backfill.counts.invalid_record`.

| Kontes | CSV hasil | Rekaman valid | Kecamatan tercakup | Desa tercakup | Rekaman hasil kosong |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilpres | 35 | 806.583 | 7.246 | 82.342 | 0 |
| DPR RI | 138 | 35.537 | 1.211 | 10.528 | 5.771 |
| DPRD Provinsi | 734 | 813.336 | 7.331 | 83.529 | 79.093 |
| DPRD Kabupaten/Kota | 733 | 813.332 | 7.330 | 83.528 | 119.589 |

Total Pilpres mencapai 84.298.880 suara 01 dan 68.221.284 suara 02, yaitu 98,5% dan 99,4% dari angka resmi KPU. Rasionya 98–100% di setiap provinsi **kecuali Papua** (01: 71,1%, 02: 61,0%), karena SITUNG tidak pernah merampungkan distrik sistem noken; kabupaten ASMAT dan kecamatan PANTE BIDARI tidak ada sama sekali. Seluruh 85 kecamatan tanpa hasil Pilpres terdaftar pada `coverage_gap.entries`.

Ekspor KawalPemilu tidak memuat kolom pemilih terdaftar, sehingga DPT dipulihkan per TPS dari scrape legacy lewat kunci `(id_kelurahan, nomor_tps)`: 497.941 dari 806.583 TPS mendapat pasangan, penuh di 15 provinsi lama dan nol di luar itu. **Partisipasi Pilpres karena itu bukan angka nasional**, dan hal itu dinyatakan pada panel maupun catatan cakupan.

Hierarki gabungan sumber terdiri dari 35 kelompok tingkat provinsi—34 provinsi dalam negeri dan `+Luar Negeri`—644 unit tingkat kabupaten/kota, 7.331 kecamatan, dan 83.529 kelurahan/desa. Unit luar negeri berada dalam hierarki dan hasil, tetapi tidak mempunyai geometri administratif Indonesia.

Kunci setiap tingkat, termasuk kelurahan, adalah ID wilayah KPU resmi; sebelumnya kunci desa hanya posisi alfabetis di dalam kecamatan sehingga bergeser tiap kali data sumber berubah. Kolom `id` pada CSV legacy ternyata sudah merupakan rangkaian ID resmi (`1149217531776900003704` = `1`·`1492`·`1753`·`1776`·`900003704`), dan seluruh baris berhasil diuraikan. Nama tampilan tetap memakai ejaan CSV hasil karena itulah yang dipakai pipeline GIS untuk mencocokkan geometri; 137 perbedaan ejaan terhadap pohon KPU tercatat pada `name_aliases`.

Angka opsi suara dipertahankan sesuai sumber. Metadata partisipasi hanya dijumlahkan ke total tervalidasi jika satu baris lolos pemeriksaan konsistensi, termasuk syarat pengguna hak pilih tidak melebihi pemilih terdaftar. Nilai mentah dan alasan penolakan tetap dicatat dalam audit. Ketidaksamaan antara jumlah opsi dan kolom `suara-sah`, nilai ekstrem, duplikasi natural TPS, berkas kosong, serta anomali lain tidak diperbaiki secara diam-diam. Angka opsi di atas 1.000 pada TPS non-Papua/non-luar-negeri dipertahankan tetapi ditandai melalui `outlier-vote-tps` karena dapat memengaruhi pemenang lokal.

### Artefak schema 2

| Path | Isi |
| --- | --- |
| `data/wilayah.json` | Hierarki lengkap KPU 2019 dan daftar empat kontes |
| `data/election2019.json` | Metadata kontes, sembilan statistik, ringkasan sumber, dan agregat eksak per kecamatan |
| `data/election2019/P<kode>.json` | 35 chunk hasil per kelurahan/desa yang dimuat sesuai provinsi aktif |
| `data/audit2019.json` | Inventaris berkas, ukuran, SHA-256, cakupan, total sumber/output, dan contoh anomali |

Sembilan statistik dalam schema adalah `total-pemilih`, `total-pengguna`, `suara-total`, `suara-sah`, `suara-tidak-sah`, `tps`, `validated-tps`, `blank-tps`, dan `outlier-vote-tps`. Setiap entri kontes berbentuk pasangan array suara dan array statistik; entri `null` berarti kontes tersebut memang tidak tersedia untuk wilayah itu.

## GeoJSON dan keselarasan historis

Semua geometri aplikasi dibaca dari `data/gis/`; tidak ada atlas wilayah yang diunduh saat runtime. Kontrak loader adalah:

| Path | Tingkat fitur |
| --- | --- |
| `data/gis/provinsi.json` | Provinsi |
| `data/gis/kab/<provinceKey>.json` | Kabupaten/kota dalam satu provinsi |
| `data/gis/kec/<regencyKey>.json` | Kecamatan dalam satu kabupaten/kota |
| `data/gis/desa/<districtKey>.json` | Kelurahan/desa dalam satu kecamatan |

Setiap fitur yang dapat dipilih harus mempunyai `properties.key` yang sama persis dengan key pada `data/wilayah.json`. Resolver nama/fuzzy dan indeks GIS lama tidak digunakan.

Koleksi `SHP GIS/` tidak menyediakan satu snapshot polygon yang tepat pada hari pemungutan suara 2019. Pipeline karena itu memakai batas Kemendagri 2018 dan GeoPackage 2020 berbasis spasial 2017 sebagai sumber utama. Untuk desa yang hanya dapat dikenali lewat layer BIG, kode administrasi resmi yang unik dipakai untuk mengambil kembali geometri historis dalam kabupaten KPU yang sama. Jika bridge itu gagal, polygon BIG dipakai dari ekstrak yang paling dekat dengan 2019 lebih dahulu—Maret 2020, baru Mei 2023—dan hanya bila UUPP fitur tidak melewati 2019 atau tahunnya memang tidak tersedia. Geometri diselaraskan kembali ke hierarki KPU 2019, termasuk penggabungan wilayah Papua hasil pemekaran setelah 2019 ke induknya pada struktur 2019.

Hasil ini adalah rekonstruksi batas yang selaras secara historis, bukan klaim snapshot resmi tunggal per 17 April 2019. Build terakhir menghasilkan cakupan berikut untuk 34 provinsi domestik:

| Tingkat | Fitur GeoJSON | Node hierarki 2019 | Cakupan |
| --- | ---: | ---: | ---: |
| Provinsi | 34 | 34 | 100% |
| Kabupaten/kota | 514 | 514 | 100% |
| Kecamatan | 7.201 | 7.201 | 100% |
| Desa/kelurahan | 81.046 | 83.398 | 97,18% |

Sebanyak 1.034 desa fallback dijembatani kembali ke geometri Kemendagri berbasis 2017/2020 melalui kode unik. Hanya 185 fitur mempertahankan polygon BIG: 131 dari ekstrak Maret 2020 dan 54 dari Mei 2023. Dari seluruhnya, 178 memiliki UUPP paling lambat 2019 dan tujuh tidak mencantumkan tahun; tidak ada UUPP pasca-2019. Enam belas baris sumber Maret 2020 dengan UUPP pasca-2019 dibuang sebelum pencocokan. Sebanyak 2.352 desa/kelurahan tanpa poligon aman tetap tersedia melalui tabel, pencarian, panel, dan ekspor; grid menggantikan peta bila seluruh anak pada tingkat aktif tidak mempunyai geometri. Tidak ada fuzzy matching. Asal, fallback, crosswalk, metode kecocokan, CRS, bbox, perbaikan geometri, dan seluruh key tanpa geometri dicatat dalam `data/gis/audit2019.json`.

Folder sumber `SHP GIS/` diabaikan Git karena ukurannya besar, sedangkan seluruh potongan GeoJSON runtime di `data/gis/` dilacak agar clone dan GitHub Pages langsung dapat menjalankan dashboard. Jika `provinsi.json` atau chunk wilayah gagal dimuat, aplikasi tetap menampilkan hasil melalui grid, panel, dan tabel.

## Menjalankan aplikasi

Jangan membuka halaman melalui `file://` karena browser umumnya memblokir `fetch()` JSON lokal. Sajikan root proyek melalui HTTP:

```powershell
cd "D:\PROJECT\Visualisasi Pemilu Indonesia 2024"
python -m http.server 8000
```

Kemudian buka [http://localhost:8000/](http://localhost:8000/). Gunakan `py -m http.server 8000` jika instalasi Windows menyediakan launcher `py` alih-alih perintah `python`.

Data, GeoJSON, JavaScript aplikasi, dan stylesheet utama disajikan dari repository. D3 7.9.0 masih dimuat dari unpkg dan merupakan dependensi runtime, sehingga koneksi internet diperlukan kecuali D3 disediakan secara lokal. Font Archivo dimuat dari Google Fonts, tetapi stylesheet dapat memakai fallback font sistem bila layanan font tidak tersedia.

### Deployment GitHub Pages

Deployment produksi aktif di GitHub Pages dan disajikan langsung dari root
branch `main`. Berkas `.nojekyll` dipertahankan agar GitHub Pages menerbitkan
pohon statis apa adanya tanpa pemrosesan Jekyll.

Repository saat ini sudah melacak data runtime berikut karena semuanya dimuat
melalui `fetch()` oleh browser:

- `data/election2019/*.json`;
- `data/gis/kab/*.json`;
- `data/gis/kec/*.json`; dan
- `data/gis/desa/*.json`.

Artefak tersebut terdiri dari 35 chunk hasil, 34 chunk kabupaten/kota, 514
chunk kecamatan, dan 7.201 chunk desa dengan ukuran total sekitar 97,8 MiB;
setiap berkas jauh di bawah 100 MiB. Jangan menghapusnya dari Git atau
memindahkannya ke Git LFS karena GitHub Pages harus menyajikan isi JSON secara
langsung. Sebaliknya, jangan commit `.venv/`, `SHP GIS/`, `data/gis/_build/`, atau
`data/gis_broken_*`; semuanya merupakan dependensi lokal, sumber mentah, atau
staging yang tidak dibutuhkan browser.

Setelah memastikan seluruh build dan tes lulus, siapkan commit dengan:

```powershell
git add -A
git status --short
git commit -m "Update dashboard and runtime data"
git push origin main
```

Kemudian pilih **Settings → Pages → Deploy from a branch**, branch `main`,
folder `/(root)`. Setelah deploy selesai, pastikan URL CSS `assets/modernist/styles.css`,
`data/election2019/P1.json`, dan `data/gis/kab/P1.json` semuanya mengembalikan
HTTP 200.

## Membangun ulang data

### Prasyarat Python

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Dependensi build yang dipin adalah `pyogrio`, `pyshp`, dan `shapely`. Frontend tidak membutuhkan bundler atau instalasi paket npm. Node.js hanya diperlukan untuk pemeriksaan sintaks `app.js` dan regresi `geo_mapping.test.js`.

### Hasil pemilu

```powershell
python build_2019_data.py `
  --source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU" `
  --pilpres-source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\csv-per-provinsi" `
  --tree-source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\full-tps-kawalpemilu" `
  --output data
```

Skrip memuat pohon wilayah KPU, merekonsiliasinya dengan `dataprov-kec.csv` yang independen, membaca tiga folder kontes legacy plus ekspor Pilpres per provinsi serta CSV pendukung, memvalidasi header dan record, lalu menulis seluruh artefak schema 2 secara atomik. Path sumber default sama dengan contoh di atas; argumen eksplisit disarankan agar build mudah diaudit.

### GIS

Tempatkan kumpulan sumber pada `SHP GIS/`, kemudian jalankan:

```powershell
python build_gis_data.py
```

Pipeline GIS membangun potongan berdasarkan key hierarki 2019 melalui area staging sebelum mengganti output akhir. Jangan memakai kembali `tools/legacy/build_kec_index.py` atau `data/gis/kec_index.json` sebagai bagian loader baru; keduanya merupakan jalur lama berbasis nama/kode yang tidak menjamin pemetaan eksak.

## Validasi

Jalankan enam pemeriksaan berikut setelah build:

```powershell
node --check app.js
node tests/geo_mapping.test.js
python tests/test_data_integrity.py
python tests/test_gis_integrity.py
python tests/test_gis_install_transaction.py
python tests/test_http_smoke.py
```

Pemeriksaan hasil memuat seluruh 35 chunk provinsi, memastikan rollup desa sama persis dengan agregat kecamatan, memverifikasi 1.954 berkas scrape legacy dan 35 CSV Pilpres beserta hash bila foldernya tersedia, menghitung ulang digest 8.011 berkas node hierarki langsung dari disk, memastikan tidak ada satu pun baris yang gagal dipetakan ke ID wilayah KPU, dan menguji kontes yang benar-benar hilang. Pemeriksaan GIS memuat 7.750 GeoJSON, memverifikasi seluruh key/parent, hash pohon keluaran, validitas 88.795 geometri, komposisi vintage polygon BIG, dan kesamaan daftar key tanpa geometri. Regresi transaksi menyimulasikan pemasangan sukses serta kegagalan satu berkas dan memastikan rollback utuh. Smoke test menyajikan aplikasi lewat HTTP lokal dan membuka entry HTML, stylesheet, metadata serta chunk hasil, dan GeoJSON. Regresi Node memeriksa schema, urutan partai, rollup, resolver key GIS, data kosong, hasil seri, dan ketiadaan jalur sintetis/atlas lama.

## Struktur proyek

| Path | Peran |
| --- | --- |
| `.editorconfig` | Aturan encoding, newline, dan indentasi lintas editor |
| `.gitattributes` | Penandaan JSON runtime sebagai artefak generated di GitHub |
| `.gitignore` | Memisahkan sumber/staging lokal dari data runtime yang dilacak |
| `.nojekyll` | Meminta GitHub Pages menyajikan pohon statis tanpa Jekyll |
| `index.html` | Entry point utama |
| `pemilu-2024.html` | Alias entry lama dengan isi Pemilu 2019 yang identik |
| `app.js` | State, lazy loader, agregasi tampilan, peta D3, interaksi, dan ekspor |
| `.thumbnail` | Pratinjau visual dashboard untuk metadata proyek |
| `AUDIT_2019.md` | Ringkasan audit manusia untuk hasil pemilu dan batas wilayah |
| `assets/modernist/` | Stylesheet dan dokumentasi design system yang dipakai kedua entry HTML |
| `build_2019_data.py` | Builder dan audit lengkap CSV hasil Pemilu 2019 |
| `build_gis_data.py` | Pemilihan sumber, penyelarasan key, konversi, dan audit GIS |
| `requirements.txt` | Dependensi Python build yang dipin |
| `tools/inspect_shp.py` | Utilitas CLI untuk melihat schema dan contoh record shapefile |
| `tools/legacy/` | Utilitas loader lama yang tidak menjadi bagian build aktif |
| `src/` | Sampel CSV lama beserta penjelasan; bukan sumber audit lengkap |
| `tests/geo_mapping.test.js` | Regresi kontrak frontend/data/GIS |
| `tests/test_data_integrity.py` | Verifikasi seluruh artefak hasil dan audit CSV |
| `tests/test_gis_integrity.py` | Verifikasi seluruh chunk, key, parent, geometri, dan audit GIS |
| `tests/test_gis_install_transaction.py` | Simulasi commit dan rollback installer GIS |
| `tests/test_http_smoke.py` | Smoke test penyajian aplikasi dan data melalui HTTP lokal |
| `SHP GIS/` | Koleksi sumber geospasial lokal; diabaikan Git |
| `data/` | Artefak hierarki, hasil, audit, GeoJSON, dan dokumentasi data runtime |

## Keterbatasan

- Cakupan kontes mengikuti CSV yang tersedia, bukan asumsi cakupan nasional. Pilpres mempunyai rekaman di 7.246 dari 7.331 kecamatan dan DPR RI hanya di 1.211 kecamatan.
- Kekosongan Pilpres tidak tersebar merata: 85 kecamatan tanpa data hampir seluruhnya di Papua, tempat SITUNG tidak pernah merampungkan distrik sistem noken, sehingga total Papua hanya 71% (01) dan 61% (02) dari angka resmi. Kabupaten ASMAT tidak ada sama sekali.
- Partisipasi Pilpres hanya terhitung di TPS yang punya pemasok DPT, yaitu 497.941 dari 806.583 TPS, dan tidak boleh dibaca sebagai angka nasional.
- DPRD Kabupaten/Kota tidak mempunyai empat TPS Harare, Zimbabwe, yang terdapat pada batch terakhir DPRD Provinsi; wilayah tersebut tetap ada dan kontes yang hilang disimpan sebagai `null`.
- Tidak ada CSV DPD, sehingga DPD tidak divisualisasikan.
- CSV adalah hasil scraping KPU dan mengandung nilai serta metadata anomali. `data/audit2019.json` harus dibaca bersama visualisasi; artefak ini bukan pengganti dokumen penetapan resmi KPU.
- Batas administratif merupakan rekonstruksi multi-sumber yang diselaraskan ke hierarki 2019, bukan satu snapshot resmi tepat pada tanggal pemilu.
- D3 dan font Archivo masih berasal dari CDN; seluruh aset runtime selain keduanya tersedia pada clone repository.
