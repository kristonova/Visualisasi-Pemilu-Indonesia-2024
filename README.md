# Visualisasi Pemilu Indonesia

Aplikasi web statis untuk menjelajahi hasil pemilu secara berjenjang dari tingkat nasional sampai kelurahan/desa. Antarmuka utama proyek saat ini menampilkan **Pemilu 2019** dan menggunakan gabungan data hasil scraping KPU 2019, angka hasil agregasi, serta data sintetis untuk menutup bagian yang belum tersedia.

> Status saat ini: proyek ini belum dapat dianggap sebagai visualisasi hasil resmi Pemilu 2024. Nama folder, berkas `pemilu-2024.html`, beberapa teks di `app.js`, dan nama berkas ekspor masih menyebut 2024, tetapi kandidat, partai, label antarmuka, dan mayoritas basis datanya adalah Pemilu 2019.

## Fitur yang tersedia

- Navigasi wilayah: Nasional → Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa.
- Lima tab pemilu: Presiden, DPR RI, DPRD Provinsi, DPRD Kabupaten/Kota, dan DPD.
- Peta interaktif dengan zoom, tooltip, breadcrumb, dan drill-down wilayah.
- Empat mode pewarnaan: pemenang, margin kemenangan, perolehan opsi tertentu, dan partisipasi.
- Pencarian provinsi, kabupaten/kota, kecamatan, dan kelurahan/desa.
- Panel ringkasan perolehan suara, DPT, pengguna hak pilih, suara sah/tidak sah, dan jumlah TPS.
- Tabel rincian yang dapat diurutkan dan diekspor ke CSV.
- Tampilan responsif untuk layar desktop dan perangkat yang lebih sempit.

## Menjalankan proyek

Proyek tidak memakai Node.js, bundler, atau proses build frontend. Berkas siap disajikan melalui HTTP server lokal.

### Prasyarat

- Browser modern.
- Python 3 untuk menjalankan server lokal. Python hanya berfungsi sebagai web server; dependensi Python tidak perlu dipasang untuk membuka aplikasinya.
- Koneksi internet. D3, `topojson-client`, serta geometri provinsi dan kabupaten/kota dimuat dari CDN saat runtime.

### Langkah menjalankan

1. Buka terminal di root proyek.

   ```powershell
   cd "D:\PROJECT\Visualisasi Pemilu Indonesia 2024"
   ```

2. Jalankan HTTP server.

   ```powershell
   py -m http.server 8000
   ```

   Jika perintah `py` tidak tersedia, gunakan salah satu perintah berikut:

   ```powershell
   python -m http.server 8000
   ```

   ```bash
   python3 -m http.server 8000
   ```

3. Buka [http://localhost:8000/](http://localhost:8000/) di browser. `index.html` adalah entry point utama.

4. Hentikan server dengan `Ctrl+C` di terminal.

Jangan membuka `index.html` langsung melalui `file://`. Aplikasi menggunakan `fetch()` untuk membaca JSON lokal, yang umumnya diblokir browser jika halaman tidak disajikan melalui HTTP.

Jika port 8000 sedang digunakan, pilih port lain, misalnya:

```powershell
py -m http.server 8080
```

Kemudian buka [http://localhost:8080/](http://localhost:8080/).

## Cara menggunakan aplikasi

1. Klik provinsi, kabupaten/kota, kecamatan, atau desa pada peta untuk memperdalam wilayah.
2. Gunakan breadcrumb di atas peta untuk kembali ke tingkat sebelumnya.
3. Pilih jenis pemilu pada tab di bagian atas.
4. Pilih mode **Pemenang**, **Margin**, **Perolehan**, atau **Partisipasi** untuk mengubah pewarnaan peta.
5. Gunakan kolom pencarian untuk berpindah langsung ke suatu wilayah.
6. Klik **Tabel rincian** untuk membuka data anak wilayah yang sedang aktif.
7. Klik **Unduh CSV** untuk mengekspor rincian wilayah aktif.

Pintasan keyboard:

| Tombol | Fungsi |
| --- | --- |
| `1`–`5` | Memilih tab jenis pemilu |
| `/` | Memfokuskan kolom pencarian |
| `Esc` atau `Backspace` | Naik satu tingkat wilayah |

## Keadaan data saat ini

`data/wilayah.json` adalah dataset utama yang dibaca aplikasi. Cakupannya saat ini:

| Cakupan | Jumlah |
| --- | ---: |
| Provinsi/kelompok tingkat provinsi | 35 |
| Kabupaten, kota, dan wilayah luar negeri | 644 |
| Kecamatan | 7.331 |
| Kecamatan dengan rincian kelurahan/desa | 3.414 |
| Kelurahan/desa | 42.455 |
| Total node wilayah yang dimuat aplikasi, termasuk Indonesia | 50.466 |

Angka 35 provinsi mencakup 34 provinsi pada struktur wilayah Pemilu 2019 dan satu kelompok `+Luar Negeri`. Sebanyak 644 unit tingkat kabupaten/kota terdiri dari 514 kabupaten/kota dalam negeri dan 130 wilayah luar negeri.

Status setiap kelompok data:

| Data | Implementasi saat ini | Status |
| --- | --- | --- |
| Hierarki wilayah | Dibaca dari `data/wilayah.json`, dibangun dari hierarki hasil scraping KPU 2019 | Data 2019 |
| Pilpres | Suara Jokowi–Ma'ruf dan Prabowo–Sandi pada wilayah yang tercakup | Data scraping/agregasi 2019 |
| DPT, pengguna hak pilih, suara sah/tidak sah, dan TPS | Tersedia dari agregasi TPS untuk 3.414 kecamatan; dataset menyimpan agregat 499.325 TPS | Data 2019 pada wilayah tercakup |
| Wilayah tanpa data TPS | Dibuat secara deterministik oleh `buildTree()` dan diskalakan agar DPT nasional mendekati 204.807.222 | Imputasi/sintetis |
| DPR RI | `data/election2019.json` berisi 1.070 kunci nama kecamatan; kecamatan tanpa nilai yang cocok diberi hasil sintetis | Campuran 2019 dan sintetis |
| DPRD Provinsi dan DPRD Kabupaten/Kota | Dibangkitkan secara deterministik dari pangsa dasar partai | Sintetis |
| DPD | Menggunakan 12 nama calon pengganti dan hasil deterministik | Placeholder/sintetis |

Karena sebagian wilayah diimputasi, agregat nasional dan wilayah yang tidak mempunyai rincian desa tidak boleh diperlakukan sebagai hasil resmi KPU. Satu kunci DPR RI juga hanya menggunakan nama kecamatan, sehingga nama kecamatan yang sama di daerah berbeda dapat bertabrakan.

### Geometri peta

- Provinsi dan kabupaten/kota diunduh saat runtime dari commit terpin repositori `ghapsara/indonesia-atlas` melalui jsDelivr. Pemetaan kabupaten/kota memakai field `kabkot`, tipe administratif dari ID BPS, dan alias ID untuk beberapa atribut atlas yang keliru/bernama lama.
- Kecamatan dimuat dari potongan GeoJSON `data/gis/kec/*.json`.
- Desa dimuat dari potongan GeoJSON `data/gis/desa/*.json`.
- `data/gis/kec_index.json` memetakan 452 key `provinsi|kabupaten/kota` KPU ke kode berkas GIS. Key mempertahankan awalan `KOTA` dan pencarian kode dibatasi ke prefix provinsi shapefile yang sesuai agar nama wilayah yang berulang tidak bertabrakan.
- `data/gis/kecamatan.json` adalah kumpulan geometri monolitik lama dan saat ini tidak dibaca oleh `app.js`.

Folder `data/gis/kec/`, `data/gis/desa/`, dan `data/gis/prov/` diabaikan oleh Git karena ukurannya besar. Working tree yang diaudit memiliki hasil generasi lokal di folder kecamatan dan desa, tetapi folder tersebut tidak akan tersedia pada clone baru. Tanpa potongan GIS tersebut, panel, pencarian, tabel, dan data wilayah tetap dapat digunakan, sedangkan geometri tingkat kecamatan/desa tidak tersedia.

## Struktur proyek

| Path | Peran |
| --- | --- |
| `index.html` | Entry point utama dan struktur antarmuka |
| `pemilu-2024.html` | Salinan identik `index.html`; dipertahankan sebagai nama entry lama |
| `app.js` | State aplikasi, pemrosesan data, visualisasi D3, interaksi, dan ekspor CSV |
| `_ds/.../styles.css` | Design system dan gaya dasar yang digunakan halaman |
| `data/wilayah.json` | Hierarki wilayah dan agregat basis Pilpres/DPT/TPS |
| `data/election2019.json` | Perolehan DPR RI 2019 yang tersedia per nama kecamatan |
| `data/gis/kec_index.json` | Indeks region-aware `provinsi|kabupaten/kota` ke potongan GIS kecamatan |
| `data/gis/kecamatan.json` | Dataset GIS monolitik lama yang tidak digunakan loader saat ini |
| `src/dataprov.csv` | Daftar provinsi dari hasil scraping |
| `src/dataprov-kec.csv` | Hierarki provinsi, kabupaten/kota, dan kecamatan |
| `src/pilpres/*.csv` | 40 berkas sampel/parsial TPS Pilpres 2019 |
| `build_2019_data.py` | Membangun `wilayah.json` dan `election2019.json` dari dataset scraping eksternal |
| `build_gis_data.py` | Memecah shapefile kecamatan/desa menjadi potongan GeoJSON |
| `build_kec_index.py` | Membangun indeks potongan GIS kecamatan |
| `inspect_shp.py` | Utilitas untuk memeriksa field dan contoh record shapefile |
| `tests/geo_mapping.test.js` | Regresi resolver kabupaten/kota, kecamatan, dan kontrak indeks GIS |

## Membangun ulang data (opsional)

Langkah ini **tidak diperlukan** untuk sekadar menjalankan aplikasi. Skrip data masih memakai path absolut ke dataset eksternal milik pengembang dan perlu dikonfigurasi sebelum digunakan.

### Menyiapkan environment Python

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install pandas pyshp
```

Di macOS/Linux, aktivasi environment dengan:

```bash
source .venv/bin/activate
python -m pip install pandas pyshp
```

### Membangun data pemilu

1. Ubah `SCRAPED_DIR` dan path terkait di `build_2019_data.py`.
2. Pastikan dataset eksternal mempunyai struktur dan nama berkas yang diharapkan skrip:
   - `Pilpres RI/data/datakpu-*.csv`
   - `Pileg DPR RI/data/datakpu-dprri-*.csv`
   - `Pilpres RI/dataprov-kec.csv`
3. Jalankan:

   ```powershell
   python build_2019_data.py
   ```

Skrip akan menimpa `data/wilayah.json` dan `data/election2019.json`. Periksa hasil dan diff sebelum menyimpannya ke Git.

Data di `src/pilpres/` saja belum cukup untuk mereproduksi JSON yang saat ini tercatat: folder tersebut hanya berisi 40 CSV parsial dengan 32.793 baris TPS, memakai pola nama yang berbeda, dan tidak menyertakan raw data DPR RI yang dibutuhkan skrip.

### Membangun potongan GIS

1. Ubah `KEC_SHP_PATH` dan `DESA_SHP_PATH` di `build_gis_data.py` agar menunjuk ke shapefile yang tersedia.
2. Jalankan konversi dan pembuatan indeks:

   ```powershell
   python build_gis_data.py
   python build_kec_index.py
   ```

Hasil konversi disimpan ke `data/gis/kec/` dan `data/gis/desa/`. Keduanya sengaja tidak dicatat oleh Git.

### Menjalankan regresi pemetaan

Jalankan validasi resolver dan indeks wilayah dengan Node.js:

```powershell
node tests/geo_mapping.test.js
```

## Keterbatasan yang diketahui

- Belum ada pipeline data resmi Pemilu 2024 di repository ini.
- Masih ada teks lama tentang 2024 pada banner analisis, komentar kode, perbandingan, dan nama berkas CSV hasil ekspor. Teks tersebut tidak menandakan bahwa datanya sudah menjadi data resmi 2024.
- Fungsi grid untuk fallback kecamatan/desa sudah ada di `app.js`, tetapi alur render saat ini selalu menyembunyikannya. Pada clone tanpa potongan GIS, area peta tingkat bawah dapat kosong walaupun panel dan tabel tetap bekerja.
- Atlas terpin belum memiliki empat kabupaten hasil pemekaran di Sulawesi Tenggara: Buton Selatan, Buton Tengah, Konawe Kepulauan, dan Muna Barat.
- Sumber SHP lama belum memiliki batas lima kecamatan Gunungkidul: Gedangsari, Girisubo, Purwosari, Saptosari, dan Tanjungsari.
- Data mentah yang dicatat di `src/` tidak lengkap untuk membangun ulang seluruh output JSON.
- Geometri dan library frontend bergantung pada layanan CDN, sehingga aplikasi belum mendukung penggunaan offline penuh.
- Proyek belum memiliki package manifest; regresi pemetaan dijalankan langsung dengan Node.js.
