# Data Runtime Visualisasi Pemilu

Direktori ini berisi seluruh berkas data siap pakai (*runtime data*) yang dimuat langsung oleh peramban di sisi klien. Berkas-berkas ini sengaja dilacak oleh Git agar dashboard pada **GitHub Pages** dapat langsung disajikan tanpa memerlukan kompilasi ulang atau *backend* dinamis.

Data untuk Pemilu 2019 dan 2024 bersifat **independen dan berdiri sendiri**. Saat pengguna beralih tahun di antarmuka web, aplikasi akan memuat ulang seluruh berkas data tahun terkait secara utuh, bukan sekadar menimpa angka di atas peta tahun sebelumnya.

## Pemilu 2019 — Format Token KPU (`P1.1207.1208.1209`)

### Struktur Berkas
- `wilayah.json`: Struktur hierarki wilayah dan relasi kode KPU 2019.
- `election2019.json` dan `election2019/*.json`: Metadata kontes pemilihan, data agregat nasional/wilayah, serta pecahan (*chunk*) hasil perolehan suara per provinsi.
- `gis/provinsi.json`, `gis/kab/`, `gis/kec/`, dan `gis/desa/`: Berkas GeoJSON batas wilayah administratif yang diselaraskan dengan hierarki 2019.
- `audit2019.json` dan `gis/audit2019.json`: Laporan inventaris berkas, *checksum*, cakupan wilayah, serta log validasi integritas data.

### Penjelasan Data
- **Konsistensi Kode Wilayah:** Setiap tingkatan wilayah menggunakan kode ID resmi dari KPU (termasuk tingkat kelurahan/desa), sehingga kunci unik seperti `P1.1207.1208.1209` bersifat konsisten dan deterministik pada setiap proses pembangunan data (*build*). Pada struktur data terdahulu, token desa hanya ditentukan berdasarkan urutan abjad di dalam kecamatan sehingga posisinya kerap bergeser saat data sumber diperbarui. Oleh sebab itu, format tautan lama ke simpul (*node*) desa sudah tidak berlaku lagi.
- **Sumber Data Hasil Suara:** Data hasil Pilpres bersumber dari hasil ekspor KawalPemilu per provinsi, sedangkan data perolehan suara DPR RI, DPRD Provinsi, dan DPRD Kabupaten/Kota dihimpun dari hasil *scraping* sistem KPU lama (*legacy*).
- **Pemulihan Data Pemilih:** Karena berkas ekspor KawalPemilu tidak memuat kolom `total-pemilih` (DPT) dan `total-pengguna`, informasi tersebut dilengkapi dan dipulihkan per TPS menggunakan data *scrape* KPU lama berdasarkan relasi `(id_kelurahan, nomor_tps)`.

## Pemilu 2024 — Format Kode Wilayah Kemendagri (`11.01.01.2015`)

### Struktur Berkas
- `wilayah2024.json`: Struktur hierarki 39 wilayah setingkat provinsi (38 provinsi dalam negeri ditambah Luar Negeri) dengan `key_prefix` kosong.
- `election2024.json` dan `election2024/*.json`: Metadata kontes, data agregat tingkat kecamatan, serta pecahan (*chunk*) hasil perolehan suara tingkat desa per provinsi.
- `gis2024/provinsi.json`, `gis2024/kab/`, `gis2024/kec/`, dan `gis2024/desa/`: Berkas GeoJSON batas wilayah administratif hasil agregasi peta desa Kemendagri 2026.
- `audit2024.json` dan `gis2024/audit2024.json`: Laporan inventaris berkas sumber, *checksum*, rekapitulasi anomali, dan log validasi spasial.

### Penjelasan Data
- **Penyelarasan Kode Kemendagri:** Pengkodean kelurahan/desa oleh KPU pada Pemilu 2024 telah diselaraskan dengan kode wilayah standar Kemendagri (kode PUM). Kunci simpul ditulis langsung menggunakan format standar seperti `11.01.01.2015`. Hal ini memungkinkan proses penggabungan (*join*) data tabular dengan atribut `KDEPUM` pada *shapefile* peta desa dilakukan secara langsung tanpa memerlukan proses pencocokan nama (*name matching*).
- **Inkompatibilitas Antar-Tahun:** Kunci wilayah 2019 dan 2024 **tidak kompatibel** dan tidak boleh disilangkan secara langsung. Hal ini disebabkan oleh pemekaran wilayah (seperti Papua yang dimekarkan menjadi enam provinsi) serta penomoran ulang pada banyak desa setelah tahun 2019.
- **Cakupan Data Sirekap:** Sumber data hasil 2024 berasal dari hasil *scraping* sistem KPU Sirekap. Mengingat publikasi konversi angka Sirekap sempat dihentikan, hanya 645.836 dari total 823.378 rekaman TPS yang memuat data numerik, sedangkan sisanya hanya menyediakan pindaian formulir Model C.Hasil-PPWP (C1).
- **Transparansi Agregasi:** Angka perolehan suara pada dasbor merupakan akumulasi dari TPS yang memuat data numerik, **bukan hasil rekapitulasi penetapan nasional resmi KPU**. Keterangan ini dicantumkan secara transparan pada panel informasi, catatan cakupan data, serta bagian catatan kaki (*footer*) aplikasi.

## Panduan Pembaruan dan Integritas Data

Hindari mengubah berkas JSON secara manual. Seluruh data harus dibangun ulang (*rebuild*) menggunakan skrip *pipeline* yang telah disediakan:

- **Pemilu 2019:** Jalankan `build_2019_data.py` (data tabular) dan `build_gis_data.py` (data spasial).
- **Pemilu 2024:** Jalankan `build_2024_data.py` (data tabular) dan `build_gis_2024.py` (data spasial).

Setelah proses pembangunan data selesai, selalu jalankan seluruh rangkaian pengujian di dalam direktori `tests/` untuk memverifikasi integritas data, konsistensi hierarki wilayah, dan keabsahan geometri spasial.
