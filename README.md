# Visualisasi Hasil Pemilu Indonesia 2019 dan 2024

Aplikasi web statis interaktif untuk menjelajahi data hasil Pemilihan Umum Indonesia dari tingkat nasional hingga kelurahan/desa, dilengkapi fitur pengalih tahun antara **2019** dan **2024**. Seluruh angka yang disajikan bersumber langsung dari data publikasi KPU hasil *scraping*; aplikasi tidak merekayasa data sintetis, tidak melakukan estimasi/imputasi pada wilayah yang tidak memiliki data, dan tidak melakukan pencocokan paksa pada nama wilayah yang ambigu.

**Dashboard Publik:** [kristonova.github.io/Visualisasi-Pemilu-Indonesia-2024](https://kristonova.github.io/Visualisasi-Pemilu-Indonesia-2024/)

Dokumentasi audit teknis yang mendalam tersedia di [`AUDIT_2019.md`](AUDIT_2019.md), [`AUDIT_2024.md`](AUDIT_2024.md), serta berkas audit *machine-readable* pada `data/audit2019.json`, `data/gis/audit2019.json`, `data/audit2024.json`, dan `data/gis2024/audit2024.json`.

## Perbandingan Pemilu 2019 dan 2024

Fitur pengalih **Tahun** pada bilah navigasi atas berpindah di antara dua dataset yang sepenuhnya terpisah. Kedua dataset tersebut memiliki perbedaan skema kode wilayah (*key*), struktur geometri peta, hingga daftar kontes pemilihan. Oleh karena itu, saat tahun dialihkan, aplikasi akan memuat ulang berkas data secara utuh, bukan sekadar menimpa angka di atas peta tahun sebelumnya.

| Parameter | Pemilu 2019 | Pemilu 2024 |
| --- | --- | --- |
| Kontes Pemilihan | Pilpres, DPR RI, DPRD Provinsi, DPRD Kab/Kota | Pilpres, DPR RI, DPD, DPRD Provinsi, DPRD Kab/Kota |
| Sumber Data | Ekspor KawalPemilu + *scrape* portal KPU lama | *Scrape* portal KPU Sirekap |
| Kode Wilayah (*Key*) | Token hierarki KPU 2019 (contoh: `P1.1207.1208.1209`) | Kode standar Kemendagri (contoh: `11.01.01.2015`) |
| Pembagian Provinsi | 34 Provinsi + `+Luar Negeri` | 38 Provinsi + Luar Negeri |
| Peta Batas Wilayah | Rekonstruksi multi-sumber selaras hierarki 2019 | Batas desa Kemendagri edisi Juli 2026 |
| Kelengkapan Data TPS | 806.583 TPS Pilpres (100% memuat data angka) | Pilpres 645.858 dari 823.378 TPS (78,4%); DPR RI 426.926 dari 823.378 TPS (51,9%); DPD 577.472 dari 823.231 TPS (70,1%); DPRD Provinsi 378.445 dari 823.236 TPS (46,0%); DPRD Kab/Kota 383.513 dari 823.236 TPS (46,6%) |

Hal-hal penting yang perlu diperhatikan saat membandingkan kedua periode:

- **Kode wilayah tidak berhubungan langsung.** Wilayah Papua dimekarkan menjadi enam provinsi setelah tahun 2019, dan banyak desa/kelurahan mengalami penomoran ulang kode wilayah. Oleh sebab itu, mekanisme peralihan tahun mencocokkan wilayah berdasarkan penelusuran nama hierarki secara bertingkat hingga tingkat terdalam yang ditemukan, bukan berdasarkan kode wilayah.
- **Tingkat kelengkapan data berbeda.** Pada Pemilu 2024, sistem Sirekap KPU sempat menghentikan publikasi konversi angka untuk sebagian TPS dan hanya menampilkan pindaian formulir Model C1. Dengan demikian, total suara 2024 pada dashboard ini murni merupakan akumulasi dari TPS yang memuat angka hasil. Rincian selengkapnya dapat dibaca di [`AUDIT_2024.md`](AUDIT_2024.md) serta tercantum pada panel informasi dan catatan kaki aplikasi.
- **Konsistensi visual warna kandidat.** Warna biru secara konsisten digunakan untuk pasangan Prabowo Subianto (nomor urut 02 pada kedua pemilu), sedangkan warna merah digunakan untuk pasangan yang diusung oleh PDI Perjuangan (Jokowi–Ma'ruf pada 2019, Ganjar–Mahfud pada 2024). Langkah ini menjaga kesinambungan visual agar pergantian tahun tidak mengubah makna warna secara membingungkan.

Untuk Pemilu 2024, hasil DPR RI, DPD, DPRD Provinsi, dan DPRD Kabupaten/Kota sudah dimuat berdampingan dengan Pilpres, sehingga dataset 2024 memuat lima kontes. Pemilu 2019 tetap memuat empat kontes karena sumber data mentahnya tidak memuat hasil DPD; tab DPD karena itu hanya muncul pada tahun 2024. Perlu dicatat bahwa DKI Jakarta dan Luar Negeri tidak menyelenggarakan pemilihan DPRD Kabupaten/Kota, dan pemilih luar negeri juga tidak menerima surat suara DPD, sehingga wilayah-wilayah itu memang kosong pada kontes tersebut. Berkas `pemilu-2024.html` tetap dipertahankan untuk kompatibilitas tautan lama dengan isi yang identik dengan `index.html`. Kedua berkas tersebut mendukung parameter URL `?tahun=2019` maupun `?tahun=2024`, serta tautan tampilan lengkap berbentuk `#2024/pilpres/61?warna=pemenang&batas=desa` (tahun, kontes, kode wilayah, pewarnaan, mode batas, dan fokus opsi).

## Fitur Utama

- **Peralihan Tahun Fleksibel (2019/2024):** Dilengkapi mekanisme pemuatan bertahap (*lazy loading*); data yang sudah diunduh disimpan dalam memori (*cache*) sehingga tidak perlu diunduh ulang saat berpindah tahun.
- **Navigasi Berjenjang (*Drill-Down*):** Penelusuran hierarki lengkap dari tingkat Nasional → Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa.
- **Mode Batas: Berjenjang | Desa:** Pilihan *Desa* mewarnai seluruh desa/kelurahan dalam satu provinsi atau kabupaten/kota sekaligus, dengan batas kabupaten/kota (atau kecamatan) sebagai garis tegas. Klik sebuah desa tetap turun satu tingkat (provinsi → kab/kota → kecamatan → desa), sehingga navigasi berjenjang tidak berubah. Di tingkat nasional pilihan ini menunggu sampai provinsi dipilih.
- **Wilayah Dimenangkan & Sorot:** Panel menghitung berapa desa (atau wilayah anak) yang dimenangkan setiap opsi, menjajarkannya dengan porsi suara, dan menandai desa tanpa poligon. Klik baris panel atau item legenda untuk menyorot unit milik opsi itu; unit lain meredup.
- **Peta Interaktif GeoJSON Lokal:** Pemetaan presisi tinggi dengan pencocokan kode wilayah eksak melalui `properties.key`.
- **Tampilan Cadangan Berbasis Kisi (*Grid Fallback*):** Otomatis menyajikan tata letak kisi (*grid*) jika data batas poligon pada tingkat wilayah terkait tidak tersedia.
- **Beragam Mode Visualisasi Tematik:** Pilihan visualisasi peta pemenang, margin kemenangan, perolehan persentase suara kandidat/partai, serta tingkat partisipasi pemilih tervalidasi.
- **DPD per Provinsi:** Calon DPD 2024 berbeda di setiap provinsi, sehingga tingkat nasional mewarnai provinsi menurut porsi calon teratasnya sendiri dan menampilkan sepuluh calon dengan suara terbanyak se-Indonesia; mulai tingkat provinsi, peta, legenda, tabel, dan ekspor memakai daftar calon provinsi tersebut, dan empat besar provinsi diberi lencana *kursi indikatif* (bukan penetapan KPU).
- **Penanganan Data Khusus & Transparan:** Mengakomodasi perolehan suara seri, data tidak tersedia, TPS dengan hasil kosong (*blank*), serta penandaan anomali data.
- **Alat Bantu Lengkap:** Fitur pencarian cepat di semua tingkatan wilayah, navigasi rekam jejak (*breadcrumb*), *tooltip* interaktif, panel ringkasan analisis, dan tabel rekapitulasi perolehan suara.
- **Kinerja Optimal & Ringan:** Pemuatan data perolehan suara tingkat desa per provinsi dan potongan geometri wilayah dilakukan sesuai kebutuhan (*on-demand*).
- **Ekspor Data CSV (UTF-8):** Menyediakan fitur ekspor data sub-wilayah aktif, lengkap dengan indikator kelengkapan data, jumlah `blank-tps`, dan `outlier-vote-tps`. Pada mode Batas Desa, tabel dan CSV memuat seluruh desa beserta kolom kabupaten/kota dan kecamatan.
- **Unduh PNG Siap-Laporan:** Satu gambar beresolusi 2× berisi judul wilayah, keterangan warna, peta seperti yang tampak (termasuk zoom dan sorot), legenda, dan catatan sumber.
- **Tautan yang Dapat Dibagikan:** Bilah alamat selalu memuat tampilan aktif; tombol *Salin tautan* menyalinnya untuk dikirim atau dibuka kembali.

Pintasan keyboard:

| Tombol | Fungsi |
| --- | --- |
| `T` | Berpindah tahun pemilu (2019 ↔ 2024) |
| `1`–`5` | Memilih jenis kontes pemilihan (2019 hanya memiliki empat tab) |
| `/` | Fokus ke kolom pencarian |
| `D` | Berganti mode batas (Berjenjang ↔ Desa) |
| `Esc` atau `Backspace` | Kembali ke tingkat wilayah di atasnya |

## Audit Data Pemilu 2019

Data Pemilu 2019 dihimpun dari dua sumber hasil *scraping* yang digabungkan secara ketat menggunakan **ID wilayah resmi KPU**, bukan berdasarkan kesamaan nama. Data *scraping* KPU lama memasok perolehan suara DPR RI, DPRD Provinsi, DPRD Kabupaten/Kota, dan menjadi satu-satunya sumber DPT. Sementara itu, data ekspor KawalPemilu per provinsi digunakan untuk Pilpres, mengingat data Pilpres pada *scraping* KPU lama hanya mencakup 15 dari 35 wilayah provinsi/luar negeri.

Alur pemrosesan data mengolah **1.989 berkas CSV** (total ukuran ~1,12 GB) serta 8.011 berkas struktur hierarki wilayah (total ~26,2 MB):

- 1.640 berkas CSV data perolehan suara;
- 342 berkas CSV Pilpres versi lama yang kini hanya dimanfaatkan untuk pemulihan DPT;
- 7 berkas CSV referensi dan pendukung; serta
- 2.468.788 baris data hasil yang valid, seluruhnya berhasil diproses ke dalam visualisasi tanpa ada data yang terbuang.

Sebanyak **204.453 baris data tercatat memiliki kolom perolehan suara yang kosong**. Data tersebut tetap diperhitungkan dalam statistik sumber sebagai `blank-tps` dan tidak diubah menjadi angka nol agar tidak menimbulkan salah tafsir. Satu baris data rusak (*pseudo-record*) yang memuat karakter NUL dicatat secara terpisah pada `dpt_backfill.counts.invalid_record`.

| Jenis Pemilihan | Berkas CSV | Baris Valid | Kecamatan | Desa/Kelurahan | Baris Hasil Kosong |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilpres | 35 | 806.583 | 7.246 | 82.342 | 0 |
| DPR RI | 138 | 35.537 | 1.211 | 10.528 | 5.771 |
| DPRD Provinsi | 734 | 813.336 | 7.331 | 83.529 | 79.093 |
| DPRD Kabupaten/Kota | 733 | 813.332 | 7.330 | 83.528 | 119.589 |

Akumulasi suara Pilpres dalam dataset ini mencapai 84.298.880 untuk pasangan 01 dan 68.221.284 untuk pasangan 02 (setara 98,5% dan 99,4% dari perolehan suara resmi KPU). Persentase ketercakupan berada pada rentang 98–100% di hampir seluruh provinsi, **kecuali Provinsi Papua** (01: 71,1% dan 02: 61,0%). Hal ini terjadi karena sistem SITUNG KPU pada saat itu tidak menuntaskan rekapitulasi untuk distrik-distrik yang menerapkan sistem noken; data Kabupaten Asmat dan Kecamatan Pante Bidari bahkan tidak tercatat sama sekali. Sebanyak 85 kecamatan yang tidak memiliki data Pilpres dicatat secara rinci pada entri `coverage_gap.entries`.

Karena berkas ekspor KawalPemilu tidak menyertakan kolom Daftar Pemilih Tetap (DPT), data DPT direkonstruksi per TPS dari *scrape* lama menggunakan kunci relasi `(id_kelurahan, nomor_tps)`. Dari total 806.583 TPS, sebanyak 497.941 TPS berhasil dipetakan (lengkap di 15 provinsi lama dan tidak tersedia di provinsi lainnya). Oleh karena itu, **angka partisipasi Pilpres 2019 bukan representasi nasional**, dan keterangan ini dicantumkan secara transparan pada panel informasi maupun catatan cakupan data.

Struktur wilayah gabungan terdiri atas 35 wilayah tingkat provinsi (34 provinsi dalam negeri ditambah `+Luar Negeri`), 644 satuan kabupaten/kota, 7.331 kecamatan, dan 83.529 kelurahan/desa. Wilayah Luar Negeri tetap terdaftar dalam hierarki dan memiliki data perolehan suara, namun tidak memiliki geometri batas wilayah administratif peta Indonesia.

Setiap tingkatan wilayah menggunakan ID resmi KPU sebagai kode pengenal unik (sebelumnya tingkat desa hanya menggunakan urutan abjad dalam kecamatan yang rentan bergeser ketika data sumber berubah). Kolom `id` pada CSV lama merupakan gabungan bertingkat dari ID resmi KPU (misalnya `1149217531776900003704` yang diurai menjadi `1`·`1492`·`1753`·`1776`·`900003704`), dan seluruh baris berhasil dipetakan secara akurat. Penamaan wilayah pada tampilan antarmuka tetap mengikuti ejaan CSV hasil agar selaras dengan pencocokan geometri GIS; 137 variasi ejaan dibandingkan pohon data KPU dicatat dalam `name_aliases`.

Perolehan suara setiap opsi dipertahankan persis sesuai data sumber aslinya. Data partisipasi pemilih hanya diakumulasikan ke dalam total tervalidasi apabila baris data terkait lolos uji konsistensi (termasuk syarat bahwa jumlah pengguna hak pilih tidak boleh melebihi jumlah pemilih terdaftar). Seluruh nilai mentah beserta alasan anomali dicatat dalam laporan audit. Ketidaksesuaian antara jumlah suara kandidat dengan kolom `suara-sah`, angka ekstrem, duplikasi nomor TPS dari sumber, maupun berkas kosong tidak dimodifikasi secara sepihak. Perolehan suara di atas 1.000 pada satu TPS non-Papua dan non-Luar Negeri tetap dipertahankan, namun ditandai sebagai `outlier-vote-tps` karena berpotensi mendistorsi penentuan pemenang di tingkat lokal.

## Audit Data Pemilu 2024

Data Pemilu 2024 bersumber tunggal dari hasil *scraping* sistem **Sirekap KPU** pada repositori [`scrapping-pemilu-2024`](https://github.com/), yakni direktori `data_pilpres/`, `data_dpr_ri/`, `data_dpd/`, `data_dpr_prov/`, dan `data_dpr_kabkot/` yang masing-masing berpola `<kode-provinsi>/<kode-kabkot>.json`. Seluruh tingkat kelurahan/desa telah menggunakan kode wilayah resmi Kemendagri, sehingga proses pengolahan data 2024 tidak memerlukan pencocokan nama (*name matching*).

Alur pemrosesan membaca **643 berkas JSON** (sekitar 978 MB), 83.860 kelurahan/desa, dan **823.378 data TPS**. Setiap berkas sumber didokumentasikan lengkap dengan ukuran dan *checksum* SHA-256 pada `data/audit2024.json`.

**Catatan Penting:** Sebanyak **177.520 TPS (21,6%) sama sekali tidak memuat angka perolehan suara** dan hanya menyertakan tautan foto formulir Model C1. Hal ini terjadi karena KPU menghentikan publikasi konversi diagram/angka Sirekap pada awal Maret 2024. Data TPS tersebut tetap dihitung dalam agregat sebagai `blank-tps` dan tidak diubah menjadi angka nol.

| Parameter | Nilai / Jumlah |
| --- | ---: |
| Total Data TPS Terdata | 823.378 |
| TPS Memiliki Data Angka | 645.858 (78,4%) |
| TPS Lolos Validasi Metadata (`validated-tps`) | 494.311 (60,0%) |
| Total Suara 01 Anies–Muhaimin | 31.378.267 |
| Total Suara 02 Prabowo–Gibran | 75.340.215 |
| Total Suara 03 Ganjar–Mahfud | 21.370.663 |
| Total Suara Seluruh Paslon | 128.089.145 |

Ketiadaan data tabulasi ini **tidak terdistribusi secara merata**. Ketercakupan data bervariasi dari 94,8% di Bengkulu hingga hanya 0,1% di Papua Pegunungan. Bahkan, enam provinsi di Pulau Papua seluruhnya memiliki cakupan di bawah 41%. Akibatnya, visualisasi peta 2024 untuk wilayah Indonesia Timur tidak dapat dianggap sebagai representasi perolehan suara final. Rincian tabel cakupan per provinsi tersedia di [`AUDIT_2024.md`](AUDIT_2024.md).

Kriteria validasi data 2024 mengikuti standar 2019 dengan satu pengecualian: aturan `total-pengguna ≤ total-pemilih` **tidak diterapkan**. Hal ini dikarenakan kolom `total-pemilih` pada Sirekap hanya mencatat DPT, sedangkan `total-pengguna` mencakup pemilih pindahan (DPTb) dan pemilih tambahan (DPK) yang secara definisi berada di luar DPT. Sebanyak 13.008 TPS tercatat memiliki jumlah pengguna suara melebihi DPT; kondisi ini dicatat sebagai `pengguna_gt_pemilih` dalam audit dan datanya tetap dipertahankan.

### Format dan Skema Data (Schema v2)

Kedua dataset menggunakan struktur kontrak data (Schema v2) yang seragam; perbedaan hanya terletak pada prefiks kode wilayah, daftar jenis pemilihan, dan jumlah pilihan/kandidat.

| Berkas | Isi Dokumen |
| --- | --- |
| `data/wilayah.json` | Hierarki lengkap wilayah KPU 2019 dan daftar 4 kontes pemilihan |
| `data/election2019.json` | Metadata kontes, sembilan ringkasan statistik, dan data agregat tingkat kecamatan |
| `data/election2019/P<kode>.json` | 35 *chunk* hasil per kelurahan/desa yang dimuat sesuai provinsi aktif |
| `data/audit2019.json` | Inventaris berkas, ukuran, SHA-256, cakupan wilayah, total suara, dan log anomali |
| `data/wilayah2024.json` | Hierarki wilayah Kemendagri 2024, `key_prefix` kosong, dan daftar kontes 2024 (`pilpres`, `dpr`, `dpd`, `dprdprov`, `dprdkab`) |
| `data/election2024.json` | Metadata kontes (termasuk daftar calon DPD per provinsi), sembilan ringkasan statistik, dan data agregat tingkat kecamatan |
| `data/election2024/<kode>.json` | 39 *chunk* hasil per kelurahan/desa (satu berkas per provinsi) |
| `data/audit2024.json` | Inventaris berkas sumber tiap surat suara, SHA-256, total mentah, dan rekapitulasi anomali |

Sembilan indikator statistik dalam skema data meliputi `total-pemilih`, `total-pengguna`, `suara-total`, `suara-sah`, `suara-tidak-sah`, `tps`, `validated-tps`, `blank-tps`, dan `outlier-vote-tps`. Setiap entri pemilihan disimpan dalam format pasangan larik (*array*) perolehan suara dan larik statistik. Nilai `null` menandakan bahwa jenis pemilihan terkait tidak tersedia untuk wilayah tersebut.

Identifikasi kolom pilihan menggunakan penamaan berbasis posisi: `pemilih-1`/`pemilih-2` untuk Pilpres 2019, `paslon-1` s.d. `paslon-3` untuk Pilpres 2024, `partai-<nomor urut>` untuk kontes legislatif berbasis partai 2024, `calon-<nomor urut>` untuk DPD 2024, serta nama partai politik untuk pemilihan legislatif 2019.

Kontes DPR RI 2024 memakai 18 kolom: `partai-1` s.d. `partai-17` ditambah `partai-24`. Nomor urut 18–23 adalah partai lokal Aceh yang menurut undang-undang hanya berkompetisi pada pemilihan DPRA dan DPRK, sehingga kolomnya memang tidak ada pada surat suara DPR RI dan bukan merupakan data yang hilang.

Kontes DPRD Provinsi dan DPRD Kabupaten/Kota 2024 memakai seluruh 24 kolom (`partai-1` s.d. `partai-24`), sebab surat suara DPRA dan DPRK di Aceh justru memuat keenam partai lokal tersebut. Di 37 provinsi lainnya keenam kolom itu bernilai nol karena partainya tidak tercetak pada surat suara, bukan karena tidak ada pemilih yang memilihnya; pembedaan ini diuji secara eksplisit pada `tests/test_2024_artifacts.py`.

Kontes DPD 2024 memakai 54 kolom posisi surat suara (`calon-1` s.d. `calon-54`, mengikuti daftar terpanjang di Jawa Barat). Karena setiap provinsi mencetak daftar calonnya sendiri (8 hingga 54 calon, total 668), kolom yang sama berarti orang yang berbeda di tiap provinsi; nama calon dikirim sebagai `rosters` per kode provinsi pada entri kontes `dpd` di `data/election2024.json`, sedangkan ID calon KPU dan perolehan per calon per provinsi (`candidate_totals`) tersimpan di `data/audit2024.json`. Kolom di atas jumlah calon suatu provinsi bernilai nol karena nomornya tidak tercetak, dan provinsi `99` (Luar Negeri) tidak memiliki roster karena pemilih PPLN tidak menerima surat suara DPD.

### Menambahkan Kontes Pemilihan 2024

Seluruh lima kontes 2024 (`pilpres`, `dpr`, `dpd`, `dprdprov`, `dprdkab`) telah dibangun oleh `build_2024_data.py` melalui entri `ContestSpec` pada konstanta `CONTESTS`, berurutan sesuai lima surat suara yang diterima pemilih. Kontes `dpd` memakai medan `roster_key` (`dpd_candidates`) agar kunci `chart` berupa ID calon diterjemahkan ke nomor urut melalui daftar calon provinsi pada berkas yang sama. Objek `PARTY_SPEC_2024` pada `app.js` mendefinisikan 24 partai peserta Pemilu 2024 lengkap beserta nomor urutnya, dengan konvensi penamaan kolom **`partai-<nomor urut>`**.

Apabila di kemudian hari terdapat surat suara lain yang perlu ditambahkan, langkah-langkah yang perlu dilakukan:

1. Menambahkan satu entri `ContestSpec` pada `CONTESTS` di `build_2024_data.py`, berisi ID kontes, direktori sumber, serta pemetaan kunci `chart` Sirekap ke kolom keluaran. Khusus untuk surat suara yang memuat partai lokal Aceh (nomor urut 18–23), medan `local_options` dipakai agar pemeriksaan kelengkapan `chart` tidak menuntut keenam kolom itu di luar Aceh, sedangkan surat suara yang daftar opsinya berbeda per provinsi memakai `roster_key`;
2. Menjalankan ulang `build_2024_data.py`, yang akan menuliskan slot kontes baru ke `data/election2024.json`, seluruh berkas *chunk* desa, `data/wilayah2024.json`, dan `data/audit2024.json` dengan urutan indeks yang konsisten; dan
3. Mendaftarkan ID kontes yang sama ke dalam `CONTEST_ORDER` dan `CONTEST_NAMES` di `app.js` serta ke daftar `contests` pada entri `DATASETS` tahun terkait, kemudian memperbarui konstanta `CONTESTS` pada `tests/test_2024_artifacts.py`.

Elemen antarmuka seperti tab pemilihan, legenda warna, tabel rincian, dan fitur ekspor CSV akan menyesuaikan secara otomatis. Jika terdapat nama kolom yang belum dikenali, sistem akan menampilkannya melalui *fallback* `unknownOption()` sehingga kekeliruan penamaan data dapat langsung terdeteksi.

## Data Geospasial (GeoJSON)

Seluruh data geometri peta dimuat langsung dari dalam repositori tanpa mengunduh atlas eksternal saat aplikasi berjalan (*runtime*). Mekanisme pemuatan bekerja identik untuk kedua tahun, dengan direktori utama `data/gis/` untuk Pemilu 2019 dan `data/gis2024/` untuk Pemilu 2024:

| Pola Lokasi Berkas | Tingkat Wilayah Administratif |
| --- | --- |
| `<gisDir>/provinsi.json` | Tingkat Provinsi |
| `<gisDir>/kab/<provinceKey>.json` | Tingkat Kabupaten/Kota dalam satu provinsi |
| `<gisDir>/kec/<regencyKey>.json` | Tingkat Kecamatan dalam satu kabupaten/kota |
| `<gisDir>/desa/<districtKey>.json` | Tingkat Kelurahan/Desa dalam satu kecamatan |
| `<gisDir>/desaprov/<provinceKey>.json` | Seluruh Kelurahan/Desa satu provinsi, untuk mode Batas Desa |

Setiap fitur wilayah dalam berkas GeoJSON wajib memiliki atribut `properties.key` yang cocok persis dengan kode pada hierarki data tahun terkait. Sistem tidak menggunakan pencocokan perkiraan (*fuzzy matching*) maupun indeks nama lama.

Berkas `desaprov/` adalah turunan `desa/`: fitur desa satu provinsi digabung ke satu berkas dan disederhanakan sekali lagi pada toleransi 0,001°, karena pada zoom provinsi dan kabupaten satu desa hanya selebar beberapa piksel. Satu permintaan per provinsi menggantikan ratusan permintaan per kecamatan (666 untuk Jawa Timur). Tampilan kecamatan tetap memakai berkas `desa/` yang lebih rinci. Ukurannya 55,6 MB untuk 2024 (terbesar Jawa Timur, 4,9 MB untuk 8.494 desa) dan 43,2 MB untuk 2019.

### Pemetaan 2019: Rekonstruksi Historis

Karena tidak tersedianya berkas *shapefile* tunggal yang memotret batas wilayah persis pada hari pemungutan suara Pemilu 2019, batas wilayah direkonstruksi menggunakan data batas Kemendagri 2018 serta GeoPackage 2020 (berbasis spasial 2017) sebagai rujukan utama. Untuk desa yang hanya teridentifikasi pada layer Badan Informasi Geospasial (BIG), kode wilayah unik digunakan untuk menjembatani geometri historis dalam kabupaten KPU yang bersangkutan. Jika jembatan kode tersebut tidak ditemukan, poligon BIG diambil dari rilis terdekat dengan 2019 (Maret 2020, disusul Mei 2023), dengan syarat tahun dasar pembentukan wilayah (UUPP) tidak melebihi 2019. Seluruh geometri diselaraskan kembali ke hierarki KPU 2019, termasuk menyatukan wilayah pemekaran baru di Papua ke provinsi induknya sesuai kondisi 2019.

Hasil rekonstruksi batas ini berfokus pada keselarasan historis data pemilu 2019, bukan sebagai peta batas resmi per 17 April 2019. Tingkat ketercakupan geometri untuk 34 provinsi dalam negeri adalah sebagai berikut:

| Tingkat Wilayah | Fitur GeoJSON | Node Hierarki 2019 | Persentase Cakupan |
| --- | ---: | ---: | ---: |
| Provinsi | 34 | 34 | 100% |
| Kabupaten/Kota | 514 | 514 | 100% |
| Kecamatan | 7.201 | 7.201 | 100% |
| Desa/Kelurahan | 81.046 | 83.398 | 97,18% |

Sebanyak 1.034 desa berhasil dipetakan kembali ke geometri Kemendagri 2017/2020 melalui pencocokan kode unik. Hanya 185 wilayah yang mempertahankan poligon BIG (131 dari data Maret 2020 dan 54 dari Mei 2023). Dari jumlah tersebut, 178 fitur memiliki tahun penetapan (UUPP) maksimal 2019 dan 7 tanpa tahun; tidak ada poligon dengan UUPP setelah 2019 yang digunakan (16 entri dengan UUPP pasca-2019 telah disaring sebelum pencocokan). Sebanyak 2.352 desa/kelurahan yang belum memiliki poligon tetap dapat diakses melalui tabel, pencarian, panel informasi, dan ekspor data; tampilan kisi (*grid*) akan aktif otomatis jika seluruh sub-wilayah tidak memiliki data spasial. Seluruh riwayat asal data, *fallback*, metode pencocokan, sistem koordinat (CRS), *bounding box*, perbaikan topologi, dan daftar wilayah tanpa geometri dicatat secara transparan pada `data/gis/audit2019.json`.

### Pemetaan 2024: Batas Desa Kemendagri Edisi Juli 2026

Peta 2024 dibangun dari satu sumber *shapefile*: `SHP GIS/[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_` — layer `BATAS_DESAKEL_AR` BIG edisi 21 Juli 2026 (84.503 fitur PolygonZ, EPSG:4326). Dataset ini merupakan satu-satunya sumber geospasial lokal yang telah memuat pemekaran 6 provinsi di Papua (kode 91–96) sekaligus menyediakan kode Kemendagri lengkap hingga tingkat desa.

Proses pemetaan dilakukan sepenuhnya berbasis kode tanpa mencocokkan nama: atribut `KDEPUM` (tanpa tanda titik) bersesuaian langsung dengan kode kelurahan/desa Pemilu 2024. Batas wilayah tingkat kecamatan, kabupaten, dan provinsi **digabungkan (*dissolve*) langsung dari awalan kode poligon desa pada *shapefile***, bukan sekadar menggabungkan desa yang memiliki hasil pemilu. Hal ini memastikan batas kabupaten dan provinsi tetap utuh dan rapat tanpa celah, meskipun terdapat desa yang datanya kosong.

Urutan proses *dissolve* dilakukan secara cermat: batas desa digabungkan terlebih dahulu **sebelum** dilakukan penyederhanaan geometri (*simplification*). Jika penyederhanaan dilakukan di awal, titik koordinat pada perbatasan antar-desa akan bergeser dan menimbulkan celah (*sliver polygons*) saat digabungkan. Pada pengujian awal, kesalahan urutan tersebut menghasilkan 290.968 segmen batas dengan ukuran berkas `provinsi.json` mencapai 24,8 MB. Setelah urutannya diperbaiki, berkas yang sama menjadi **3,1 MB dengan 21.609 segmen batas** tanpa kehilangan detail garis pantai, dan total folder turun dari 188 MB menjadi 133 MB.

| Tingkat Wilayah | Fitur GeoJSON | Node Hierarki 2024 | Persentase Cakupan |
| --- | ---: | ---: | ---: |
| Provinsi | 38 | 38 domestik (+ Luar Negeri) | 100% |
| Kabupaten/Kota | 514 | 514 domestik (+ 129 PPLN) | 100% |
| Kecamatan | 7.272 | 7.277 domestik (+ 129 PPLN) | 99,93% |
| Desa/Kelurahan | 83.364 | 83.731 domestik (+ 129 PPLN) | 99,56% |

Sebanyak 83.009 desa terhubung secara langsung melalui kecocokan kode wilayah. Sebanyak 355 desa lainnya dipetakan melalui *fallback* dengan syarat ketat: kesamaan nama kanonik **di dalam kabupaten yang sama**, hanya jika terdapat tepat satu kandidat yang cocok, dan poligon tersebut belum digunakan oleh desa lain. Sebanyak 367 desa (0,44%) belum memiliki data geometri—mayoritas berada di Provinsi Papua Barat Daya dan Papua Pegunungan akibat perbedaan penomoran desa antara data pemilu 2024 dan rilis Kemendagri 2026 (wilayah yang juga memiliki ketercakupan data Sirekap terendah). Daftar lengkap kode wilayah tanpa geometri tercatat di `data/gis2024/audit2024.json`.

Wilayah Luar Negeri (kode 99) tidak memiliki batas administratif geospasial di peta Indonesia; 129 Panitia Pemilihan Luar Negeri (PPLN) tetap tercatat dalam struktur hierarki, tabel data, fitur pencarian, ekspor, dan divisualisasikan dalam bentuk kisi (*grid*). Selain itu, sebanyak 967 poligon pada *shapefile* yang berlabel "Area Tidak Terdefinisi" tanpa kode Kemendagri (mencakup total 116 km² dari 1.890.179 km²) dikeluarkan dari seluruh tingkatan karena bukan merupakan unit wilayah administratif resmi. Berkas kosong tetap ditulis untuk seluruh kabupaten dan kecamatan luar negeri agar *loader* tidak pernah menerima HTTP 404.

Ukuran keluaran akhir: `provinsi.json` 3,1 MB, `kab/` 6,7 MB, `kec/` 24 MB, dan `desa/` 100 MB — total 133 MB untuk 91.188 fitur peta.

Direktori sumber `SHP GIS/` diabaikan oleh Git karena ukurannya yang besar. Sebaliknya, seluruh berkas GeoJSON siap pakai pada `data/gis/` dan `data/gis2024/` tetap disertakan dalam repositori agar pengguna yang melakukan *clone* maupun pengunjung di GitHub Pages dapat langsung menjalankan dashboard tanpa perlu melakukan proses *build* ulang. Jika berkas peta wilayah tertentu gagal dimuat, aplikasi secara adaptif (*graceful fallback*) beralih menyajikan data melalui tampilan kisi, panel informasi, dan tabel rekapitulasi.

## Panduan Menjalankan Aplikasi

Hindari membuka berkas HTML langsung melalui protokol `file://` karena peramban modern memblokir permintaan `fetch()` ke berkas JSON lokal. Jalankan *web server* lokal dari direktori utama proyek:

```powershell
cd "D:\PROJECT\Project Pribadi\Visualisasi Pemilu Indonesia 2024"
python -m http.server 8000
```

Setelah server aktif, buka [http://localhost:8000/](http://localhost:8000/) pada peramban web Anda. Gunakan perintah `py -m http.server 8000` jika sistem Windows Anda menggunakan *launcher* `py`.

Seluruh data, berkas GeoJSON, skrip JavaScript aplikasi, dan *stylesheet* disajikan secara lokal dari repositori. Pustaka D3 (v7.9.0) dimuat melalui CDN unpkg sehingga membutuhkan koneksi internet (kecuali jika pustaka D3 disediakan secara lokal). Tipografi Archivo dimuat melalui Google Fonts, dengan *fallback* otomatis ke *font* sistem apabila koneksi internet tidak tersedia.

### Publikasi ke GitHub Pages

Aplikasi ini disajikan untuk produksi melalui GitHub Pages langsung dari direktori utama (*root*) pada *branch* `main`. Berkas `.nojekyll` disertakan agar GitHub Pages menyajikan seluruh berkas statis apa adanya tanpa pemrosesan Jekyll.

Repositori ini telah melacak seluruh berkas data yang dibutuhkan saat aplikasi berjalan (*runtime*):

- `data/election2019/*.json` dan `data/election2024/*.json`;
- `data/gis/{kab,kec,desa,desaprov}/*.json`; serta
- `data/gis2024/{kab,kec,desa,desaprov}/*.json`.

Untuk dataset 2019, berkas ini mencakup 35 *chunk* perolehan suara, 34 *chunk* kabupaten/kota, 514 *chunk* kecamatan, dan 7.201 *chunk* desa. Untuk dataset 2024 mencakup 39 *chunk* suara, 39 *chunk* kabupaten/kota, 643 *chunk* kecamatan, dan 7.406 *chunk* desa. Ukuran setiap berkas berada jauh di bawah batas 100 MB. Jangan menghapus berkas-berkas tersebut dari Git ataupun memindahkannya ke Git LFS agar GitHub Pages dapat menyajikan berkas JSON secara langsung. Sebaliknya, pastikan untuk tidak meng-commit direktori seperti `.venv/`, `SHP GIS/`, `data/gis/_build/`, `data/gis2024_stage/`, `data/gis2024_stage_desaprov/`, `data/gis_stage_desaprov/`, `data/_stage2024/`, atau `data/gis_broken_*` karena direktori tersebut hanya berupa dependensi lokal, berkas mentah, atau area penampungan sementara (*staging*).

Setelah memastikan seluruh proses pembangunan data dan pengujian berhasil, lakukan *commit* dan *push*:

```powershell
git add -A
git status --short
git commit -m "Update dashboard and runtime data"
git push origin main
```

Pada pengaturan repositori GitHub, buka **Settings → Pages → Build and deployment**, pilih sumber **Deploy from a branch**, arahkan ke *branch* `main` dan folder `/ (root)`. Setelah proses *deployment* selesai, pastikan aset seperti `assets/modernist/styles.css`, `data/election2019/P1.json`, `data/gis/kab/P1.json`, `data/election2024/11.json`, dan `data/gis2024/kab/11.json` dapat diakses dengan respons HTTP 200.

## Membangun Ulang Data (Data Pipeline)

### Prasyarat Lingkungan Python

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Dependensi Python untuk pengolahan data telah dikunci pada versi tertentu di `requirements.txt` (`pyogrio`, `pyshp`, dan `shapely`). Sisi antarmuka (*frontend*) tidak memerlukan *bundler* maupun instalasi paket npm. Node.js hanya diperlukan jika Anda ingin menjalankan pemeriksaan sintaksis `app.js` dan uji regresi otomatis.

### Memproses Data Pemilu 2019

```powershell
python build_2019_data.py `
  --source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU" `
  --pilpres-source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\csv-per-provinsi" `
  --tree-source "D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\full-tps-kawalpemilu" `
  --output data
```

Skrip ini memuat struktur hierarki wilayah KPU, merekonsiliasinya dengan berkas pembanding `dataprov-kec.csv`, membaca folder data pemilihan KPU lama serta ekspor Pilpres per provinsi, memvalidasi struktur data dan baris rekaman, kemudian menghasilkan seluruh berkas Schema v2 secara atomik (*transaksional*). Nilai *default* untuk lokasi data sumber telah disesuaikan dengan struktur di atas; penggunaan argumen eksplisit sangat disarankan untuk memudahkan audit proses *build*.

### Memproses Data Pemilu 2024

```powershell
python build_2024_data.py `
  --source "D:\PROJECT\Project Pribadi\scrapping-pemilu-2024" `
  --output data
```

Skrip membaca 643 berkas `<prov>/<kab>.json` pada masing-masing dari kelima direktori kontes (untuk DPD sekaligus daftar calon provinsinya), mengambil nama provinsi dari `master_data/wilayah_provinsi.json` dan nama kabupaten/kecamatan dari berkas DBF *shapefile*, menerapkan aturan validasi per TPS, lalu menyusun berkas `wilayah2024.json`, `election2024.json`, *chunk* desa per provinsi, serta `audit2024.json`. Sebelum berkas dipasang ke direktori utama, sistem melakukan verifikasi integritas: agregasi suara tingkat kecamatan harus cocok persis dengan total penjumlahan *chunk* desa, dan daftar desa pada hierarki harus identik dengan daftar desa pada hasil pemilu.

### Memproses Data GIS 2019

Tempatkan berkas-berkas *shapefile* sumber pada folder `SHP GIS/`, kemudian jalankan:

```powershell
python build_gis_data.py
```

Alur kerja GIS menyusun potongan GeoJSON berdasarkan kode hierarki 2019 melalui direktori sementara (*staging*) sebelum memperbarui direktori produksi. Skrip lama seperti `tools/legacy/build_kec_index.py` dan berkas `data/gis/kec_index.json` sudah ditinggalkan karena menggunakan metode berbasis nama/kode lama yang tidak menjamin kecocokan eksak.

### Memproses Data GIS 2024

Jalankan skrip ini setelah `build_2024_data.py` selesai, karena pemroses GIS membutuhkan `data/wilayah2024.json` sebagai acuan kode wilayah yang valid:

```powershell
python build_gis_2024.py
```

Proses *build* terakhir membutuhkan waktu **5.321 detik (89 menit)** pada prosesor *single-thread* karena membaca *shapefile* sebesar 2,1 GB per kabupaten dan menggabungkan (*dissolve*) 83.529 poligon desa ke tingkat di atasnya. Provinsi kepulauan seperti Nusa Tenggara Barat dan Sulawesi Tengah menghabiskan porsi waktu terbesar. Hasil *build* divalidasi secara ketat sebelum dipasang: setiap kecamatan wajib memiliki berkas desa, setiap kabupaten wajib memiliki berkas kecamatan, dan setiap kode fitur peta wajib terdaftar pada struktur hierarki.

### Memproses Berkas Desa per Provinsi (Mode Batas Desa)

Jalankan setelah GIS tahun terkait selesai dibangun. Skrip membaca berkas `desa/` yang sudah terpasang (bukan *shapefile*), sehingga selesai dalam sekitar 30 detik per tahun:

```powershell
python build_desa_provinsi.py --gis-dir data/gis2024 --hierarchy data/wilayah2024.json
python build_desa_provinsi.py --gis-dir data/gis --hierarchy data/wilayah.json
```

Keluaran ditulis ke direktori *staging* `data/<gis>_stage_desaprov/`, diverifikasi (satu berkas per provinsi hierarki; himpunan desa setiap berkas identik dengan gabungan `desa/` provinsinya), lalu dipasang ke `<gisDir>/desaprov/`. Provinsi tanpa poligon, seperti Luar Negeri, tetap mendapat berkas kosong.

## Pengujian dan Validasi Data

Jalankan rangkaian pemeriksaan berikut untuk memastikan integritas data dan antarmuka:

```powershell
node --check app.js
node tests/geo_mapping.test.js
node tests/year_switch.test.js
python tests/test_data_integrity.py
python tests/test_gis_integrity.py
python tests/test_2024_artifacts.py
python tests/test_gis_install_transaction.py
python tests/test_http_smoke.py
```

Pengujian data 2019 memuat seluruh 35 *chunk* provinsi, memverifikasi bahwa penjumlahan data desa identik dengan agregat kecamatan, mencocokkan *hash* 1.954 berkas *scrape* KPU lama dan 35 CSV Pilpres, menghitung ulang *checksum* 8.011 berkas struktur hierarki dari penyimpanan lokal, memastikan seluruh baris data terpetakan ke ID resmi KPU, serta memvalidasi ketiadaan kontes tertentu. Sementara itu, pengujian GIS 2019 memeriksa 7.750 berkas GeoJSON, memverifikasi relasi kode wilayah dan induknya, keabsahan 88.795 geometri poligon, tahun rilis poligon BIG, serta konsistensi daftar wilayah tanpa data geometri.

Skrip `tests/test_2024_artifacts.py` menghitung ulang seluruh perolehan suara 2024 dari *chunk* desa dan membandingkannya dengan agregat kecamatan serta laporan audit, memverifikasi bahwa format kode desa sesuai standar Kemendagri, lalu memvalidasi seluruh berkas GeoJSON 2024 (kesesuaian berkas dengan hierarki, relasi kode induk, keabsahan geometri, *bounding box*, dan daftar wilayah tanpa peta). Berkas `desaprov/` kedua tahun diperiksa terpisah: setiap berkas harus memuat persis desa yang digambar oleh `desa/` provinsinya, dengan geometri yang tetap valid setelah penyederhanaan tambahan. Opsi `--skip-gis` dapat digunakan jika Anda hanya ingin menguji data perolehan suara.

Uji transaksi memverifikasi mekanisme *commit* dan *rollback* direktori saat proses instalasi berhasil maupun gagal di tengah jalan. *Smoke test* menjalankan server HTTP lokal untuk menguji aksesibilitas halaman HTML, *stylesheet*, metadata, *chunk* suara, serta GeoJSON untuk **kedua tahun pemilu**. Uji regresi Node.js memeriksa fungsionalitas pemuat data frontend untuk 2019 dan 2024, termasuk kepatuhan skema, urutan opsi pemilihan, agregasi suara, pencocokan kode GIS, penanganan data kosong, kondisi seri, konsistensi warna kandidat, serta memastikan tidak ada sisa pustaka atlas lama.

## Struktur Repositori

| Berkas / Direktori | Peran dan Deskripsi |
| --- | --- |
| `.editorconfig` | Konfigurasi format teks, pemisah baris, dan indentasi editor |
| `.gitattributes` | Menandai berkas JSON *runtime* sebagai artefak *generated* di GitHub |
| `.gitignore` | Mengabaikan berkas sumber mentah dan direktori *staging* dari pelacakan Git |
| `.nojekyll` | Memastikan GitHub Pages menyajikan berkas statis tanpa pemrosesan Jekyll |
| `index.html` | Berkas utama antarmuka web dashboard |
| `pemilu-2024.html` | Tautan alternatif lama (konten identik dengan `index.html`) |
| `app.js` | Logika utama dashboard: manajemen *state*, pemuatan data (*lazy loader*), agregasi statistik, visualisasi peta D3, interaktivitas, dan ekspor data |
| `.thumbnail` | Gambar pratinjau visual dashboard untuk metadata proyek |
| `AUDIT_2019.md` | Dokumentasi audit teknis hasil pemilu dan batas wilayah 2019 |
| `AUDIT_2024.md` | Dokumentasi audit teknis hasil pemilu dan batas wilayah 2024 |
| `assets/modernist/` | Berkas *stylesheet* dan dokumentasi sistem desain |
| `build_2019_data.py` | Skrip penyusunan data dan audit hasil Pemilu 2019 dari berkas CSV |
| `build_gis_data.py` | Skrip pengolahan, penyelarasan kode wilayah, dan audit data spasial GIS 2019 |
| `build_2024_data.py` | Skrip penyusunan data dan audit hasil Pilpres, DPR RI, DPRD Provinsi, serta DPRD Kabupaten/Kota 2024 dari data Sirekap |
| `build_gis_2024.py` | Skrip agregasi (*dissolve*) batas desa Kemendagri 2026 dan audit GIS 2024 |
| `build_desa_provinsi.py` | Skrip penggabungan desa per provinsi (`desaprov/`) untuk mode Batas Desa, kedua tahun |
| `requirements.txt` | Daftar dependensi pustaka Python untuk *data pipeline* |
| `tools/inspect_shp.py` | Utilitas CLI untuk memeriksa skema dan sampel data *shapefile* |
| `tools/legacy/` | Utilitas pemrosesan lama (tidak digunakan dalam alur *build* aktif) |
| `src/` | Sampel data CSV lama (hanya sebagai referensi historis) |
| `tests/geo_mapping.test.js` | Pengujian integrasi antarmuka, struktur data, dan pemetaan GIS kedua tahun |
| `tests/year_switch.test.js` | Pengujian fitur pergantian tahun: inisialisasi, *drill-down*, penyimpanan *cache*, dan *fallback* kisi |
| `tests/test_data_integrity.py` | Verifikasi integritas seluruh artefak data dan audit perolehan suara |
| `tests/test_gis_integrity.py` | Verifikasi berkas GeoJSON, kode wilayah, hierarki, geometri, dan audit GIS 2019 |
| `tests/test_2024_artifacts.py` | Verifikasi data hasil pemilu, laporan audit, dan GeoJSON 2024 berdasarkan perhitungan ulang |
| `tests/test_gis_install_transaction.py` | Pengujian mekanisme transaksi *commit* dan *rollback* pada instalasi GIS |
| `tests/test_http_smoke.py` | Pengujian aksesibilitas aplikasi dan berkas data melalui server HTTP lokal |
| `SHP GIS/` | Direktori penyimpanan data spasial mentah lokal (diabaikan oleh Git) |
| `data/` | Direktori artefak data hasil pemilu, hierarki wilayah, GeoJSON, dan laporan audit |

## Keterbatasan dan Catatan Data

- **Ketercakupan Berdasarkan Data Mentah:** Kelengkapan data dibatasi oleh ketersediaan berkas CSV sumber, bukan asumsi data nasional lengkap. Sebagai contoh, Pilpres 2019 memiliki data di 7.246 dari 7.331 kecamatan, sedangkan pemilihan DPR RI hanya tercatat di 1.211 kecamatan.
- **Distribusi Data Pilpres 2019 Tidak Merata:** Ketiadaan data Pilpres 2019 terpusat di wilayah tertentu; 85 kecamatan tanpa data hampir seluruhnya berada di Papua karena sistem SITUNG KPU tidak merampungkan rekapitulasi untuk distrik yang menerapkan sistem noken. Akibatnya, total suara yang terekam di Papua hanya 71% (paslon 01) dan 61% (paslon 02) dari hasil resmi, serta data Kabupaten Asmat tidak tersedia sama sekali.
- **Batasan Statistik Partisipasi 2019:** Tingkat partisipasi Pilpres 2019 hanya dapat dihitung pada TPS yang memiliki data DPT (497.941 dari 806.583 TPS). Oleh karena itu, angka partisipasi tidak dapat diartikan sebagai angka agregat nasional.
- **Pengecualian Wilayah Luar Negeri Khusus:** Data DPRD Kabupaten/Kota tidak menyertakan 4 TPS di Harare, Zimbabwe (yang sempat tercatat pada data DPRD Provinsi); entri wilayah tersebut tetap ditampilkan dengan nilai kontes `null`.
- **Ketiadaan Data Pemilihan DPD 2019:** Data pemilihan DPD 2019 tidak divisualisasikan karena tidak tersedia berkas sumbernya; tab DPD hanya muncul pada tahun 2024.
- **Sifat Data Scraping:** Seluruh data berasal dari hasil *scraping* portal KPU dan mengandung anomali bawaan dari sumber aslinya. Pengguna disarankan membaca `data/audit2019.json` sebagai pendamping visualisasi; repositori ini ditujukan untuk analisis data dan bukan merupakan dokumen pengganti keputusan penetapan resmi KPU.
- **Batas Geospasial 2019 Bersifat Rekonstruksi:** Batas wilayah administratif 2019 merupakan hasil rekonstruksi multi-sumber yang diselaraskan secara historis dengan hierarki KPU 2019, bukan rekaman batas resmi tunggal pada hari pemungutan suara.

Catatan Khusus Pemilu 2024:

- **Perolehan Suara 2024 Bukan Rekapitulasi Resmi Nasional:** Sistem Sirekap KPU hanya memublikasikan angka tabulasi pada 645.858 dari 823.378 TPS (78,4%). Dengan demikian, total 128.089.145 suara paslon pada dashboard ini murni akumulasi dari TPS yang memuat angka. Untuk data penetapan resmi pemenang pemilu, silakan merujuk langsung pada Surat Keputusan penetapan KPU RI.
- **Kekosongan Data Terpusat Secara Geografis:** Tingkat ketiadaan data 2024 sangat terpusat: dari 94,8% di Bengkulu hingga hanya 0,1% di Papua Pegunungan. Peta perolehan suara di enam provinsi wilayah Papua tidak dapat dijadikan kesimpulan hasil pemilu di daerah tersebut.
- **Cakupan Validasi Partisipasi 2024:** Statistik partisipasi pemilih 2024 hanya dihitung dari 494.311 TPS (60,0%) yang memenuhi kriteria validasi metadata; data TPS yang memiliki anomali tidak disertakan dalam kalkulasi agregat partisipasi.
- **Ketersediaan Kontes Pemilihan 2024:** Visualisasi 2024 mencakup pemilihan Presiden dan Wakil Presiden, DPR RI, DPD, DPRD Provinsi, serta DPRD Kabupaten/Kota.
- **DPD 2024 Dipilih per Provinsi:** Setiap provinsi adalah satu daerah pemilihan berkursi empat dengan daftar calonnya sendiri, sehingga tidak ada pemenang DPD nasional. Lencana *kursi indikatif* pada empat besar provinsi dihitung hanya dari TPS berangka dan **bukan penetapan calon terpilih oleh KPU**; di provinsi berselisih tipis (misalnya Aceh dan Papua Barat) maupun bercakupan rendah (Papua) urutannya dapat berbeda dari hasil resmi.
- **Cakupan DPD 2024:** Sebanyak 70,1% TPS memuat angka (577.472 dari 823.231), dengan akumulasi 95.403.370 suara calon—di bawah Pilpres, tetapi jauh di atas ketiga kontes legislatif berbasis partai. Seluruh 3.075 TPS PPLN kosong secara sah karena pemilih luar negeri tidak menerima surat suara DPD. Sumber DPD tidak memuat Desa Sungai Mawang (`61.06.23.2005`, Kapuas Hulu) sehingga slotnya `null`, serta tidak memuat satu baris pun untuk Desa Sungai Antu (`61.06.23.2001`) dan PPLN Kuala Lumpur (U).
- **Cakupan DPR RI 2024 Lebih Rendah:** Hanya 51,9% TPS DPR RI yang memuat angka, dibanding 78,4% pada Pilpres, sehingga akumulasi 77.308.092 suara partai setara sekitar separuh suara sah nasional. Kekosongan *scrape* untuk Kecamatan Gunungkencana di Kabupaten Lebak beserta 12 desanya, ditambah satu TPS di Desa Sekarwangi, Kecamatan Curugbitung, telah tertutup melalui penarikan ulang pada 27 Agustus 2026, sehingga kontes ini kini mencakup seluruh 83.860 desa/kelurahan.
- **Cakupan DPRD Provinsi 2024 Paling Rendah:** Hanya 46,0% TPS DPRD Provinsi yang memuat angka, dengan akumulasi 66.366.387 suara partai. Kekosongan *scrape* untuk Sulawesi Tengah—Kabupaten Donggala, Morowali, Morowali Utara, Kota Palu, serta dua kecamatan di Kabupaten Buol, total 487 desa pada 45 kecamatan—telah tertutup melalui penarikan ulang pada 27 Agustus 2026, sehingga kontes ini kini mencakup seluruh 83.860 desa/kelurahan. Seluruh 129 PPLN tetap tercatat kosong, sebab pemilih luar negeri memang tidak memilih DPRD Provinsi.
- **Cakupan DPRD Kabupaten/Kota 2024:** Sebanyak 46,6% TPS memuat angka (383.513 dari 823.236), dengan akumulasi 71.699.129 suara partai. Penyebut itu mencakup DKI Jakarta dan Luar Negeri yang tidak menyelenggarakan kontes ini; bila keduanya dikeluarkan, cakupannya menjadi 48,6% dari 789.395 TPS. Kontes ini terekam utuh pada seluruh 83.860 desa/kelurahan tanpa satu pun slot `null`.
- **DKI Jakarta dan Luar Negeri Tanpa DPRD Kabupaten/Kota:** Kabupaten dan kota administrasi di DKI Jakarta tidak memiliki DPRD sendiri, sedangkan pemilih luar negeri hanya memilih Pilpres dan DPR RI. Seluruh 30.766 TPS DKI Jakarta dan 3.075 TPS PPLN karena itu bernilai nol pada kontes ini secara sah menurut regulasi, bukan karena datanya hilang.
- **Kolom Partai Lokal Aceh pada Kedua Kontes DPRD:** Kontes DPRD Provinsi dan DPRD Kabupaten/Kota memakai seluruh 24 kolom partai karena surat suara DPRA dan DPRK di Aceh memuat enam partai lokal bernomor 18–23. Di provinsi lainnya keenam kolom tersebut bernilai nol karena partainya tidak tercetak pada surat suara, bukan karena tidak ada yang memilihnya.
- **Rujukan Batas Wilayah 2024:** Batas wilayah 2024 mengacu pada data spasial Kemendagri edisi Juli 2026 (bukan batas persis pada 14 Februari 2024). Sebanyak 367 desa/kelurahan (0,44%) tidak memiliki poligon peta karena perubahan kode wilayah pasca-pemekaran, yang sebagian besar berada di Papua Barat Daya dan Papua Pegunungan.
- **Visualisasi Panitia Pemilihan Luar Negeri (PPLN):** Sebanyak 129 PPLN (Luar Negeri) tidak memiliki geometri peta wilayah dan disajikan melalui representasi kisi (*grid*), tabel, fitur pencarian, dan ekspor data.
- **Ketergantungan Aset Eksternal:** Pustaka D3 dan tipografi Archivo saat ini dimuat secara daring via CDN; adapun seluruh berkas dan data aplikasi lainnya telah tersedia lengkap di dalam repositori.
