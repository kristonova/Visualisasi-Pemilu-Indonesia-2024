# Data Runtime Visualisasi Pemilu

Direktori ini memuat seluruh berkas data siap pakai (*runtime data*) yang diakses langsung oleh peramban (*client-side browser*). Berkas-berkas ini disimpan dan dilacak di repositori Git agar dasbor pada **GitHub Pages** dapat langsung disajikan secara statis tanpa memerlukan server *backend* dinamis maupun proses kompilasi ulang saat *deployment*.

Dataset Pemilu 2019 dan 2024 dikelola secara **terpisah dan independen**. Saat pengguna beralih tahun pada antarmuka aplikasi, sistem akan memuat dataset tahun yang dipilih secara utuh, bukan sekadar menimpa nilai angka di atas struktur peta sebelumnya.

## Pemilu 2019 — Format Token Hierarki KPU (`P1.1207.1208.1209`)

### Struktur Berkas
- `wilayah.json`: Struktur hierarki wilayah administratif beserta pemetaan kode resmi KPU 2019.
- `election2019.json` dan `election2019/*.json`: Metadata kontes pemilihan, agregasi suara tingkat nasional dan daerah, serta pecahan (*chunk*) perolehan suara per provinsi.
- `gis/provinsi.json`, `gis/kab/`, `gis/kec/`, dan `gis/desa/`: Berkas GeoJSON batas wilayah administratif yang diselaraskan dengan hierarki data 2019.
- `audit2019.json` dan `gis/audit2019.json`: Inventaris berkas data, nilai *checksum*, ringkasan cakupan wilayah, serta log validasi integritas data.

### Karakteristik & Catatan Data
- **Konsistensi Kode Wilayah:** Seluruh tingkatan wilayah menggunakan kode ID resmi KPU (hingga tingkat kelurahan/desa). Dengan demikian, pengenal unik (*unique key*) seperti `P1.1207.1208.1209` selalu konsisten dan deterministik di setiap proses *build*. Pada versi data lama, kode desa hanya disusun berdasarkan urutan abjad di dalam kecamatan sehingga posisinya rentan bergeser saat sumber data diperbarui; skema tautan lama tersebut kini sudah sepenuhnya ditinggalkan.
- **Sumber Data Perolehan Suara:** Hasil Pilpres diambil dari berkas ekspor per provinsi milik KawalPemilu, sedangkan perolehan suara legislatif (DPR RI, DPRD Provinsi, dan DPRD Kab/Kota) dihimpun dari penarikan (*scraping*) portal KPU 2019.
- **Pemulihan Data Pemilih (DPT):** Berkas ekspor KawalPemilu tidak menyertakan kolom `total-pemilih` (DPT) maupun `total-pengguna`. Informasi ini kemudian dipulihkan pada tingkat TPS menggunakan data penarikan KPU melalui pencocokan pasangan kunci `(id_kelurahan, nomor_tps)`.

## Pemilu 2024 — Format Kode Wilayah Standar Kemendagri (`11.01.01.2015`)

### Struktur Berkas
- `wilayah2024.json`: Struktur hierarki 39 wilayah tingkat satu (38 provinsi serta wilayah Luar Negeri) tanpa awalan kunci (`key_prefix`).
- `election2024.json` dan `election2024/*.json`: Metadata kontes, data agregat tingkat kecamatan, serta pecahan (*chunk*) perolehan suara tingkat desa per provinsi. Setiap baris wilayah memuat satu slot per kontes sesuai urutan larik `contests`; slot bernilai `null` menandakan kontes tersebut tidak memiliki rekaman di wilayah itu.
- `gis2024/provinsi.json`, `gis2024/kab/`, `gis2024/kec/`, dan `gis2024/desa/`: Berkas GeoJSON batas wilayah administratif hasil penggabungan poligon desa Kemendagri.
- `audit2024.json` dan `gis2024/audit2024.json`: Inventaris berkas sumber, nilai *checksum*, rekapitulasi anomali, serta log validasi spasial.

### Karakteristik & Catatan Data
- **Standardisasi Kode Kemendagri:** Pada Pemilu 2024, KPU telah menyelaraskan kode desa/kelurahan dengan standar kode wilayah Kemendagri (kode PUM). Kunci wilayah ditulis langsung dalam format baku seperti `11.01.01.2015`. Hal ini memungkinkan penggabungan (*join*) antara data tabel dan atribut `KDEPUM` pada peta (*shapefile*) berjalan presisi tanpa perlu pencocokan nama yang rentan salah.
- **Perbedaan Antarperiode:** Kunci wilayah 2019 dan 2024 **tidak saling cocok** dan tidak dapat digabungkan langsung. Ketidaksesuaian ini timbul akibat pemekaran daerah (seperti Papua yang dimekarkan menjadi enam provinsi) serta penomoran ulang kode desa di berbagai wilayah pasca-2019.
- **Kontes yang Tersedia:** Dataset 2024 memuat empat kontes, yaitu `pilpres`, `dpr`, `dprdprov`, dan `dprdkab`, yang berbagi satu hierarki wilayah dan dibangun dalam satu proses *build*. Surat suara DPR RI hanya memuat 18 partai nasional (`partai-1` s.d. `partai-17` dan `partai-24`); nomor urut 18–23 adalah partai lokal Aceh yang hanya berkompetisi pada pemilihan DPRA dan DPRK. Sebaliknya, kontes `dprdprov` dan `dprdkab` memakai seluruh 24 kolom karena surat suara DPRA dan DPRK di Aceh memang memuat keenam partai lokal tersebut, sehingga nilai nol pada kolom 18–23 di luar Aceh berarti partainya tidak tercetak pada surat suara.
- **Cakupan Data Sirekap:** Data hasil 2024 diperoleh dari penarikan sistem Sirekap KPU. Karena publikasi konversi angka Sirekap sempat dihentikan oleh KPU, pada Pilpres tercatat 645.858 dari total 823.378 TPS yang memiliki data numerik, pada DPR RI 426.926 dari 823.378 TPS, pada DPRD Provinsi 378.445 dari 823.236 TPS, dan pada DPRD Kabupaten/Kota 383.513 dari 823.236 TPS. Sisanya hanya menyediakan pindaian formulir Model C.Hasil (C1-Plano).
- **Kelengkapan Sumber DPR RI:** Penarikan `dpr_ri` sempat belum lengkap untuk Kecamatan Gunungkencana, Kabupaten Lebak (`36.02.08`), seluruh 12 desanya beserta 117 baris TPS, ditambah satu baris TPS di Desa Sekarwangi, Kecamatan Curugbitung (`36.02.23.2008`). Kekosongan tersebut telah tertutup melalui penarikan ulang pada 27 Agustus 2026, sehingga kontes ini kini mencakup seluruh 83.860 desa/kelurahan tanpa satu pun slot `null`.
- **Kelengkapan Sumber DPRD Provinsi:** Penarikan `dprdprov` sempat belum lengkap untuk Sulawesi Tengah—Kabupaten Donggala (`72.03`), Morowali (`72.06`), Morowali Utara (`72.12`), Kota Palu (`72.71`), serta Kecamatan Tiloan (`72.05.07`) dan Paleleh Barat (`72.05.11`) di Kabupaten Buol, seluruhnya 487 desa pada 45 kecamatan. Kekosongan tersebut telah tertutup melalui penarikan ulang pada 27 Agustus 2026, sehingga kontes ini kini mencakup seluruh 83.860 desa/kelurahan tanpa satu pun slot `null`. Wilayah luar negeri (kode `99`) terekam utuh tetapi seluruhnya kosong, sebab pemilih PPLN tidak memilih DPRD Provinsi.
- **Kelengkapan Sumber DPRD Kabupaten/Kota:** Penarikan `dprdkab` terekam utuh sejak awal: 643 berkas sumber dan 823.236 baris TPS pada seluruh 83.860 desa/kelurahan tanpa satu pun slot `null`. Jumlah barisnya sama persis dengan DPRD Provinsi, termasuk kekosongan PPLN Kuala Lumpur (U) (`99.BF.01.0001`) yang menyatakan `total_tps` 142 tanpa satu pun baris `tps_results`. DKI Jakarta (kode `31`, 30.766 TPS) dan luar negeri (kode `99`, 3.075 TPS) terekam utuh tetapi seluruhnya kosong, sebab kabupaten/kota administrasi DKI Jakarta tidak memiliki DPRD sendiri dan pemilih PPLN tidak memilih DPRD Kabupaten/Kota.
- **Transparansi Agregasi:** Angka perolehan suara pada dasbor murni merupakan hasil penjumlahan TPS yang datanya tersedia secara numerik, **bukan rekapitulasi resmi hasil penetapan nasional KPU**. Penjelasan ini ditampilkan secara transparan di panel informasi, catatan cakupan data, serta bagian catatan kaki (*footer*) aplikasi.

## Pembaruan dan Pengujian Data

Jangan menyunting berkas JSON secara manual. Seluruh data harus dikompilasi ulang melalui skrip *pipeline* yang tersedia:

- **Pemilu 2019:** Jalankan `build_2019_data.py` (data tabel/perolehan suara) dan `build_gis_data.py` (data spasial).
- **Pemilu 2024:** Jalankan `build_2024_data.py` (data tabel/perolehan suara, seluruh kontes sekaligus) dan `build_gis_2024.py` (data spasial).

Setelah proses kompilasi data selesai, selalu jalankan seluruh pengujian di dalam direktori `tests/` guna memastikan keutuhan data, konsistensi hierarki wilayah, serta validitas geometri peta.
