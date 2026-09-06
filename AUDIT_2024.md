# Audit Data Pemilu dan Batas Wilayah 2024

Dokumen ini menyajikan ringkasan audit data Pemilu dan batas wilayah 2024 dalam format yang mudah dipahami (*human-readable*). Rincian teknis yang lengkap—seperti inventaris per berkas, *checksum* SHA-256, akumulasi data mentah per kolom, sampel anomali, serta rekonsiliasi keluaran—tersimpan di dalam `data/audit2024.json` pada blok `contests.<id kontes>`, terpisah untuk setiap surat suara. Sementara itu, laporan audit spasial (GIS) dihasilkan secara otomatis oleh `build_gis_2024.py` ke dalam `data/gis2024/audit2024.json`.

Silakan merujuk ke [`AUDIT_2019.md`](AUDIT_2019.md) untuk dokumentasi audit Pemilu 2019. Perlu dicatat bahwa data kedua tahun pemilu ini menggunakan skema kunci identitas wilayah yang berbeda dan tidak dapat digabungkan secara langsung hanya melalui kode wilayah.

## Ringkasan Eksekutif

Data Pemilu 2024 bersumber dari hasil *scraping* sistem Sirekap KPU yang **memiliki keterbatasan data numerik**. KPU secara resmi menghentikan penayangan diagram konversi angka pada awal Maret 2024 dan hanya mempertahankan unggahan foto formulir Model C.Hasil (C1-Plano) untuk sebagian TPS. Dari total 823.378 rekaman TPS yang dihimpun, sebanyak **645.858 TPS (78,4%) memiliki data angka perolehan suara**, sedangkan 177.520 TPS lainnya tidak memuat data numerik (*blank*).

Tingkat kelengkapan data numerik ini sangat bervariasi antarwilayah, mulai dari 94,8% di Bengkulu hingga hanya 0,1% di Papua Pegunungan. Oleh karena itu, akumulasi 128.089.145 suara paslon pada *dashboard* visualisasi ini murni merupakan penjumlahan dari TPS yang memuat data numerik, **bukan rekapitulasi hasil penetapan resmi KPU secara nasional**. Peta sebaran dan penentuan paslon unggul di enam provinsi wilayah Papua juga tidak dapat merepresentasikan hasil akhir di wilayah tersebut secara akurat.

Dataset 2024 kini memuat keempat surat suara sekaligus: Pilpres, DPR RI, DPRD Provinsi, dan DPRD Kabupaten/Kota. Keterbatasan Sirekap terasa **semakin berat pada surat suara legislatif**: dari 823.378 rekaman TPS DPR RI, hanya **426.926 TPS (51,9%) yang memuat angka**, sehingga akumulasi 77.308.092 suara partai setara sekitar setengah dari total suara sah nasional; pada DPRD Provinsi angkanya lebih rendah lagi, yaitu **378.445 dari 823.236 TPS (46,0%)** dengan akumulasi 66.366.387 suara partai, sedangkan DPRD Kabupaten/Kota mencatat **383.513 dari 823.236 TPS (46,6%)** dengan akumulasi 71.699.129 suara partai. Keempatnya berbagi satu hierarki wilayah dan satu himpunan kunci simpul yang sama; pembacaan hasil pada peta cukup berpindah tab kontes tanpa memuat ulang dataset.

Khusus pada DPRD Kabupaten/Kota perlu dicatat bahwa **dua wilayah tingkat provinsi memang tidak menyelenggarakan kontes ini**, yaitu DKI Jakarta—yang kabupaten dan kota administrasinya tidak memiliki DPRD sendiri—serta Luar Negeri. Seluruh baris TPS di kedua wilayah tersebut tercatat kosong secara sah, bukan karena penarikan datanya gagal.

## Hasil Pemilu

Seluruh data diproses dari satu sumber *scrape* terpadu tanpa penggabungan lintas *dataset*:

| Sumber Data | Cakupan & Peruntukan | Jalur Berkas Sumber (*Source Path*) |
| --- | --- | --- |
| *Scrape* Sirekap KPU (`hhcw/ppwp`) | Hasil Pilpres 2024 tingkat TPS | `...\scrapping-pemilu-2024\data_pilpres` |
| *Scrape* Sirekap KPU (`hhcd/pdpr`) | Hasil DPR RI 2024 tingkat TPS | `...\scrapping-pemilu-2024\data_dpr_ri` |
| *Scrape* Sirekap KPU (`hhcw/pdprdp`) | Hasil DPRD Provinsi 2024 tingkat TPS | `...\scrapping-pemilu-2024\data_dpr_prov` |
| *Scrape* Sirekap KPU (`hhcw/pdprdk`) | Hasil DPRD Kabupaten/Kota 2024 tingkat TPS | `...\scrapping-pemilu-2024\data_dpr_kabkot` |
| *Master data* wilayah KPU | Referensi 38 provinsi + Luar Negeri | `...\scrapping-pemilu-2024\master_data\wilayah_provinsi.json` |
| Tabel DBF *shapefile* desa Kemendagri Juli 2026 | Referensi nama kabupaten/kota dan kecamatan | `SHP GIS\[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_` |

*Pipeline* memproses **643 berkas JSON** untuk masing-masing surat suara, yakni Pilpres (0,95 GiB), DPR RI (4,87 GiB), DPRD Provinsi (4,43 GiB), dan DPRD Kabupaten/Kota (4,19 GiB); gabungannya mencakup 83.860 desa/kelurahan. Keempat surat suara dipindai dalam satu proses *build* karena berbagi satu hierarki wilayah; setiap baris keluaran memuat satu slot per kontes mengikuti urutan `CONTESTS` pada `build_2024_data.py`. Seluruh rekaman berhasil dimuat ke dalam artefak visualisasi tanpa ada data yang terbuang. Data TPS yang tidak memiliki angka perolehan suara dikategorikan secara khusus sebagai data kosong melalui indikator statistik `blank-tps`, bukan dicatat sebagai perolehan suara nol (`0`).

| Parameter / Indikator | Pilpres | DPR RI | DPRD Provinsi | DPRD Kab/Kota |
| --- | ---: | ---: | ---: | ---: |
| Berkas sumber | 643 | 643 | 643 | 643 |
| Desa/kelurahan bersuara | 83.860 | 83.860 | 83.860 | 83.860 |
| Total baris rekaman TPS | 823.378 | 823.378 | 823.236 | 823.236 |
| TPS dengan data angka perolehan suara | 645.858 (78,4%) | 426.926 (51,9%) | 378.445 (46,0%) | 383.513 (46,6%) |
| TPS lolos validasi konsistensi metadata | 494.311 (60,0%) | 402.964 (48,9%) | 353.246 (42,9%) | 353.140 (42,9%) |
| Σ Total seluruh suara | 128.089.145 | 77.308.092 | 66.366.387 | 71.699.129 |

Struktur hierarki wilayah berlaku sama untuk keempat kontes: 83.860 desa/kelurahan, 7.406 kecamatan, 643 kabupaten/kota (termasuk 129 PPLN), serta 39 wilayah tingkat provinsi (38 provinsi + Luar Negeri).

### Perolehan Suara Pilpres

| Pasangan Calon | Σ Suara |
| --- | ---: |
| 01 — Anies–Muhaimin | 31.378.267 |
| 02 — Prabowo–Gibran | 75.340.215 |
| 03 — Ganjar–Mahfud | 21.370.663 |
| **Total** | **128.089.145** |

### Perolehan Suara DPR RI

Surat suara DPR RI 2024 memuat **18 partai nasional**, yaitu nomor urut 1–17 ditambah Partai Ummat pada nomor 24. Nomor urut 18–23 adalah partai lokal Aceh yang menurut Undang-Undang Pemerintahan Aceh hanya berkompetisi pada pemilihan DPRA dan DPRK; ketiadaan kolomnya pada kontes ini merupakan karakteristik surat suara, **bukan data yang hilang**. Kolom keluaran mengikuti konvensi `partai-<nomor urut>`, sehingga kontes ini memakai `partai-1` s.d. `partai-17` dan `partai-24`.

Angka perolehan suara partai diambil dari medan `jml_suara_total` pada blok `chart` Sirekap, yakni jumlah suara partai berikut seluruh calegnya. Medan `jml_suara_partai` yang hanya mencatat coblosan pada lambang partai saja sengaja tidak dipakai, karena bukan angka yang menjadi dasar konversi kursi.

| No. Urut | Partai | Nama Lengkap | Σ Suara | Proporsi |
| ---: | --- | --- | ---: | ---: |
| 3 | PDI-P | PDI Perjuangan | 12.662.978 | 16,38% |
| 4 | Golkar | Partai Golkar | 11.641.389 | 15,06% |
| 2 | Gerindra | Partai Gerakan Indonesia Raya | 10.288.289 | 13,31% |
| 1 | PKB | Partai Kebangkitan Bangsa | 8.911.006 | 11,53% |
| 5 | NasDem | Partai NasDem | 7.292.721 | 9,43% |
| 8 | PKS | Partai Keadilan Sejahtera | 5.792.517 | 7,49% |
| 14 | Demokrat | Partai Demokrat | 5.730.565 | 7,41% |
| 12 | PAN | Partai Amanat Nasional | 5.378.145 | 6,96% |
| 17 | PPP | Partai Persatuan Pembangunan | 3.097.920 | 4,01% |
| 15 | PSI | Partai Solidaritas Indonesia | 2.410.209 | 3,12% |
| 7 | Gelora | Partai Gelombang Rakyat Indonesia | 1.149.489 | 1,49% |
| 16 | Perindo | Partai Perindo | 971.412 | 1,26% |
| 10 | Hanura | Partai Hati Nurani Rakyat | 564.609 | 0,73% |
| 6 | Buruh | Partai Buruh | 452.651 | 0,59% |
| 24 | Ummat | Partai Ummat | 324.023 | 0,42% |
| 13 | PBB | Partai Bulan Bintang | 255.860 | 0,33% |
| 11 | Garuda | Partai Garda Republik Indonesia | 223.176 | 0,29% |
| 9 | PKN | Partai Kebangkitan Nusantara | 161.133 | 0,21% |
| | | **Total** | **77.308.092** | **100,00%** |

Meskipun hanya mencakup 51,9% TPS, proporsi antarpartai pada akumulasi ini berada dalam rentang sekitar satu poin persentase terhadap hasil penetapan resmi KPU. Kesesuaian tersebut menunjukkan bahwa TPS yang datanya tidak terkonversi tersebar cukup merata secara politik, **namun tetap tidak menjadikan angka absolut di atas sebagai hasil resmi**.

#### Wilayah yang Sempat Tanpa Data DPR RI

*Scrape* DPR RI sempat **kehilangan satu kecamatan utuh**, yaitu **Kecamatan Gunungkencana, Kabupaten Lebak, Banten** (`36.02.08`) beserta 12 desanya, meskipun datanya lengkap pada Pilpres. Di kabupaten yang sama, **Desa Sekarwangi, Kecamatan Curugbitung** (`36.02.23.2008`) kehilangan satu baris TPS sehingga tercatat sebagai satu-satunya `tps_count_mismatch` pada kontes ini:

| Kode | Wilayah | Cakupan yang Sempat Hilang |
| --- | --- | ---: |
| `36.02.08` | Kecamatan Gunungkencana, Kabupaten Lebak | 12 dari 12 desa · 117 baris TPS |
| `36.02.23.2008` | Desa Sekarwangi, Kecamatan Curugbitung | 1 dari 11 baris TPS |

Kedua kekosongan itu menjelaskan seluruh selisih 118 baris TPS terhadap Pilpres (823.378 berbanding 823.260) yang tercatat pada artefak versi sebelumnya. Keduanya **telah tertutup melalui penarikan ulang berkas `data_dpr_ri/36/3602.json` pada 27 Agustus 2026**. DPR RI kini terekam dengan 823.378 baris TPS pada seluruh 83.860 desa/kelurahan, sama persis dengan Pilpres, sehingga tidak tersisa satu pun slot `null` maupun `tps_count_mismatch` pada kontes ini.

Konvensi penulisannya tetap berlaku bila kekosongan serupa muncul kembali: wilayah tanpa rekaman ditulis sebagai `null` pada slot kontes, bukan sebagai deretan angka nol, sehingga antarmuka menampilkannya sebagai wilayah tanpa data dan bukan sebagai wilayah tanpa pemilih.

### Perolehan Suara DPRD Provinsi

Berbeda dengan DPR RI, surat suara DPRD Provinsi **memakai seluruh 24 nomor urut**. Di 37 provinsi surat suara hanya mencetak 18 partai nasional yang sama, tetapi di Aceh surat suara DPRA turut memuat enam partai lokal bernomor 18–23 sesuai Undang-Undang Pemerintahan Aceh. Kolom keluaran karena itu dibuat lengkap dari `partai-1` sampai `partai-24` untuk seluruh provinsi; **nilai nol pada kolom 18–23 di luar Aceh berarti partainya tidak tercetak pada surat suara, bukan berarti tidak ada yang memilihnya**. Pemeriksaan kelengkapan blok `chart` pada *pipeline* menyesuaikan diri dengan aturan ini melalui medan `local_options`, sehingga surat suara 18 kolom di luar Aceh tidak dianggap sebagai data yang tidak lengkap.

Sama seperti DPR RI, angka perolehan suara partai diambil dari medan `jml_suara_total`, yakni jumlah suara partai berikut seluruh calegnya.

| No. Urut | Partai | Nama Lengkap | Σ Suara | Proporsi |
| ---: | --- | --- | ---: | ---: |
| 3 | PDI-P | PDI Perjuangan | 10.779.464 | 16,24% |
| 2 | Gerindra | Partai Gerakan Indonesia Raya | 9.496.557 | 14,31% |
| 4 | Golkar | Partai Golkar | 8.910.915 | 13,43% |
| 1 | PKB | Partai Kebangkitan Bangsa | 8.135.972 | 12,26% |
| 8 | PKS | Partai Keadilan Sejahtera | 5.423.523 | 8,17% |
| 5 | NasDem | Partai NasDem | 5.379.525 | 8,11% |
| 14 | Demokrat | Partai Demokrat | 5.125.410 | 7,72% |
| 12 | PAN | Partai Amanat Nasional | 4.356.286 | 6,56% |
| 17 | PPP | Partai Persatuan Pembangunan | 3.084.420 | 4,65% |
| 15 | PSI | Partai Solidaritas Indonesia | 1.272.323 | 1,92% |
| 16 | Perindo | Partai Perindo | 936.782 | 1,41% |
| 10 | Hanura | Partai Hati Nurani Rakyat | 893.965 | 1,35% |
| 7 | Gelora | Partai Gelombang Rakyat Indonesia | 702.315 | 1,06% |
| 13 | PBB | Partai Bulan Bintang | 423.250 | 0,64% |
| 6 | Buruh | Partai Buruh | 410.392 | 0,62% |
| 24 | Ummat | Partai Ummat | 302.754 | 0,46% |
| 21 | PA | Partai Aceh *(lokal Aceh)* | 244.246 | 0,37% |
| 9 | PKN | Partai Kebangkitan Nusantara | 194.554 | 0,29% |
| 11 | Garuda | Partai Garda Republik Indonesia | 179.024 | 0,27% |
| 22 | PAS Aceh | Partai Adil Sejahtera Aceh *(lokal Aceh)* | 52.499 | 0,08% |
| 18 | PNA | Partai Nanggroe Aceh *(lokal Aceh)* | 38.497 | 0,06% |
| 23 | SIRA | Partai SIRA *(lokal Aceh)* | 13.177 | 0,02% |
| 20 | PDA | Partai Darul Aceh *(lokal Aceh)* | 6.777 | 0,01% |
| 19 | Gabthat | Partai Generasi Atjeh Beusaboh Tha'at Dan Taqwa *(lokal Aceh)* | 3.760 | 0,01% |
| | | **Total** | **66.366.387** | **100,00%** |

Keenam partai lokal Aceh mengumpulkan 358.956 suara, seluruhnya berasal dari Provinsi Aceh. Uji regresi `tests/test_2024_artifacts.py` memverifikasi hal ini secara eksplisit: penjumlahan kolom `partai-18` s.d. `partai-23` di luar kode provinsi `11` wajib bernilai tepat nol, sedangkan di dalam Aceh wajib lebih besar dari nol.

#### Wilayah Tanpa Data DPRD Provinsi

*Scrape* DPRD Provinsi sempat **belum lengkap untuk Provinsi Sulawesi Tengah**. Empat kabupaten/kota tidak memiliki berkas sumber sama sekali, dan dua kecamatan di Kabupaten Buol tidak terekam meskipun berkas kabupatennya ada:

| Kode | Wilayah | Cakupan yang Sempat Hilang |
| --- | --- | ---: |
| `72.03` | Kabupaten Donggala | 16 dari 16 kecamatan |
| `72.06` | Kabupaten Morowali | 9 dari 9 kecamatan |
| `72.12` | Kabupaten Morowali Utara | 10 dari 10 kecamatan |
| `72.71` | Kota Palu | 8 dari 8 kecamatan |
| `72.05.07` | Kecamatan Tiloan, Kabupaten Buol | seluruh desa |
| `72.05.11` | Kecamatan Paleleh Barat, Kabupaten Buol | seluruh desa |

Seluruh kekosongan tersebut, yakni 487 desa/kelurahan pada 45 kecamatan, **telah tertutup melalui penarikan ulang pada 27 Agustus 2026**. Sulawesi Tengah kini terekam utuh dengan 9.462 baris TPS, sama persis dengan Pilpres dan DPR RI, sehingga tidak ada lagi satu pun slot `null` pada kontes DPRD Provinsi di seluruh Indonesia.

Yang tersisa hanyalah satu kelurahan luar negeri yang tercatat sebagai `tps_count_mismatch`, satu-satunya kasus pada kontes ini di mana jumlah baris `tps_results` lebih sedikit daripada medan `total_tps` yang dinyatakan sumber:

| Kode | Desa/Kelurahan | Baris TPS |
| --- | --- | ---: |
| `99.BF.01.0001` | Kuala Lumpur, Malaysia (U) | 0 dari 142 |

Dengan demikian selisih 142 baris TPS terhadap Pilpres maupun DPR RI (823.378 berbanding 823.236) berasal sepenuhnya dari Kuala Lumpur (U).

Terlepas dari kekosongan Kuala Lumpur (U) di atas, **seluruh 3.075 baris TPS luar negeri yang berhasil ditarik tercatat kosong tanpa satu pun angka**. Hal ini bukan kegagalan penarikan data, melainkan konsekuensi regulasi: pemilih luar negeri hanya memberikan suara untuk Pilpres dan DPR RI (Dapil DKI Jakarta II), dan tidak memilih DPRD Provinsi. Baris TPS luar negeri karena itu tercatat sebagai `blank-tps`, konsisten dengan penanganan TPS dalam negeri yang datanya tidak terkonversi.

### Perolehan Suara DPRD Kabupaten/Kota

Sama seperti DPRD Provinsi, surat suara DPRD Kabupaten/Kota **memakai seluruh 24 nomor urut**. Di 36 provinsi penyelenggara lainnya surat suara hanya mencetak 18 partai nasional, sedangkan di Aceh surat suara DPRK turut memuat enam partai lokal bernomor 18–23 sesuai Undang-Undang Pemerintahan Aceh. Kolom keluaran karena itu dibuat lengkap dari `partai-1` sampai `partai-24`; **nilai nol pada kolom 18–23 di luar Aceh berarti partainya tidak tercetak pada surat suara, bukan berarti tidak ada yang memilihnya**. Angka perolehan suara partai kembali diambil dari medan `jml_suara_total`, yakni jumlah suara partai berikut seluruh calegnya.

Berbeda dengan ketiga kontes lainnya, kontes ini **tidak diselenggarakan di dua wilayah tingkat provinsi**. DKI Jakarta tidak mengenal DPRD tingkat kabupaten/kota—satu kabupaten administrasi dan lima kota administrasinya dipimpin bupati/wali kota yang diangkat gubernur dan tidak memiliki dewan sendiri—sedangkan pemilih luar negeri hanya memberikan suara untuk Pilpres dan DPR RI. Seluruh 30.766 baris TPS DKI Jakarta dan 3.075 baris TPS luar negeri karena itu tercatat kosong **secara sah menurut regulasi**, bukan karena penarikan datanya gagal.

| No. Urut | Partai | Nama Lengkap | Σ Suara | Proporsi |
| ---: | --- | --- | ---: | ---: |
| 3 | PDI-P | PDI Perjuangan | 11.881.313 | 16,57% |
| 4 | Golkar | Partai Golkar | 9.579.686 | 13,36% |
| 1 | PKB | Partai Kebangkitan Bangsa | 9.218.510 | 12,86% |
| 2 | Gerindra | Partai Gerakan Indonesia Raya | 9.009.732 | 12,57% |
| 5 | NasDem | Partai NasDem | 6.374.526 | 8,89% |
| 8 | PKS | Partai Keadilan Sejahtera | 5.548.999 | 7,74% |
| 14 | Demokrat | Partai Demokrat | 5.384.806 | 7,51% |
| 12 | PAN | Partai Amanat Nasional | 4.566.468 | 6,37% |
| 17 | PPP | Partai Persatuan Pembangunan | 4.029.757 | 5,62% |
| 10 | Hanura | Partai Hati Nurani Rakyat | 1.520.742 | 2,12% |
| 16 | Perindo | Partai Perindo | 1.196.952 | 1,67% |
| 15 | PSI | Partai Solidaritas Indonesia | 783.386 | 1,09% |
| 7 | Gelora | Partai Gelombang Rakyat Indonesia | 706.739 | 0,99% |
| 13 | PBB | Partai Bulan Bintang | 590.950 | 0,82% |
| 24 | Ummat | Partai Ummat | 356.169 | 0,50% |
| 6 | Buruh | Partai Buruh | 280.791 | 0,39% |
| 9 | PKN | Partai Kebangkitan Nusantara | 219.555 | 0,31% |
| 21 | PA | Partai Aceh *(lokal Aceh)* | 191.468 | 0,27% |
| 11 | Garuda | Partai Garda Republik Indonesia | 131.353 | 0,18% |
| 18 | PNA | Partai Nanggroe Aceh *(lokal Aceh)* | 60.273 | 0,08% |
| 22 | PAS Aceh | Partai Adil Sejahtera Aceh *(lokal Aceh)* | 42.627 | 0,06% |
| 20 | PDA | Partai Darul Aceh *(lokal Aceh)* | 10.869 | 0,02% |
| 23 | SIRA | Partai SIRA *(lokal Aceh)* | 10.271 | 0,01% |
| 19 | Gabthat | Partai Generasi Atjeh Beusaboh Tha'at Dan Taqwa *(lokal Aceh)* | 3.187 | 0,00% |
| | | **Total** | **71.699.129** | **100,00%** |

Keenam partai lokal Aceh mengumpulkan 318.695 suara, seluruhnya berasal dari Provinsi Aceh. Sebagaimana pada DPRD Provinsi, `tests/test_2024_artifacts.py` memverifikasi hal ini secara eksplisit; khusus untuk kontes ini pengujian juga menuntut agar penjumlahan seluruh kolom pada kode provinsi `31` dan `99` bernilai tepat nol.

#### Cakupan dan Kelengkapan DPRD Kabupaten/Kota

Kontes ini terekam utuh sejak penarikan pertama: 643 berkas sumber, 823.236 baris TPS pada seluruh 83.860 desa/kelurahan, tanpa satu pun slot `null`. Jumlah barisnya identik dengan DPRD Provinsi, dan selisih 142 baris terhadap Pilpres maupun DPR RI berasal dari kasus yang persis sama, yaitu PPLN Kuala Lumpur (U):

| Kode | Desa/Kelurahan | Baris TPS |
| --- | --- | ---: |
| `99.BF.01.0001` | Kuala Lumpur, Malaysia (U) | 0 dari 142 |

Kelurahan tersebut menyatakan `total_tps` sebanyak 142 tetapi tidak memuat satu pun baris `tps_results`, dan merupakan satu-satunya `tps_count_mismatch` pada kontes ini.

Dari 823.236 baris tersebut, **383.513 TPS (46,6%) memuat angka**, sedikit lebih tinggi daripada DPRD Provinsi (46,0%). Angka itu perlu dibaca dengan penyebut yang tepat: apabila DKI Jakarta dan Luar Negeri—yang memang tidak menyelenggarakan kontes ini—dikeluarkan, cakupannya menjadi **383.513 dari 789.395 TPS (48,6%)**. Pada penyebut 789.395 TPS yang sama, Pilpres tercatat 78,7%, DPR RI 52,8%, dan DPRD Provinsi 47,0%; jadi DPRD Kabupaten/Kota berada di atas DPRD Provinsi tetapi tetap di bawah DPR RI.

### Perbandingan dengan Hasil Rekapitulasi Resmi KPU

Angka hasil penetapan resmi KPU secara sengaja **tidak dimasukkan** ke dalam repositori ini dan tidak dijadikan acuan pembanding otomatis di dalam *pipeline*. Pengguna disarankan untuk merujuk langsung pada Surat Keputusan KPU mengenai Penetapan Hasil Pemilu 2024 sebelum mengutip angka perolehan suara dari *dashboard* ini. Verifikasi yang dapat dipastikan secara objektif dari data pada repositori ini adalah tingkat kelengkapan internal: 78,4% TPS memuat angka perolehan suara pada Pilpres, 51,9% pada DPR RI, 46,0% pada DPRD Provinsi, dan 46,6% pada DPRD Kabupaten/Kota. Selisih terhadap total suara nasional sepenuhnya disebabkan oleh proporsi data Sirekap yang belum terkonversi menjadi angka saat proses penayangan dihentikan.

### Cakupan Kelengkapan Data per Provinsi

- **TPS Berangka:** Jumlah rekaman TPS yang memuat setidaknya satu data angka perolehan suara pada kontes bersangkutan.
- **Tervalidasi:** Rekaman TPS yang blok data `administrasi`-nya lengkap serta lolos seluruh uji konsistensi logika, sehingga dapat diikutsertakan ke dalam kalkulasi agregat partisipasi pemilih.

Karena setiap surat suara membawa blok `administrasi` sendiri, keempat tabel di bawah dihitung secara terpisah dan angkanya memang tidak identik.

#### Pilpres

| Kode | Provinsi | Σ Suara Paslon | Total TPS | TPS Berangka | % Berangka | TPS Tervalidasi | % Tervalidasi |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | Aceh | 2.514.614 | 16.046 | 12.820 | 79,9% | 9.392 | 58,5% |
| 12 | Sumatera Utara | 5.026.536 | 45.875 | 28.895 | 63,0% | 18.168 | 39,6% |
| 13 | Sumatera Barat | 2.741.940 | 17.569 | 15.632 | 89,0% | 13.322 | 75,8% |
| 14 | Riau | 2.573.422 | 19.366 | 13.575 | 70,1% | 9.950 | 51,4% |
| 15 | Jambi | 1.803.721 | 11.160 | 9.142 | 81,9% | 7.522 | 67,4% |
| 16 | Sumatera Selatan | 4.292.074 | 25.985 | 21.469 | 82,6% | 15.366 | 59,1% |
| 17 | Bengkulu | 1.203.132 | 6.210 | 5.886 | 94,8% | 5.149 | 82,9% |
| 18 | Lampung | 4.673.791 | 25.825 | 23.686 | 91,7% | 21.021 | 81,4% |
| 19 | Kepulauan Bangka Belitung | 771.016 | 4.116 | 3.591 | 87,2% | 2.892 | 70,3% |
| 21 | Kepulauan Riau | 697.409 | 5.914 | 3.620 | 61,2% | 2.420 | 40,9% |
| 31 | DKI Jakarta | 4.717.848 | 30.766 | 22.727 | 73,9% | 12.305 | 40,0% |
| 32 | Jawa Barat | 21.860.932 | 140.457 | 107.512 | 76,5% | 75.548 | 53,8% |
| 33 | Jawa Tengah | 20.393.275 | 117.299 | 105.471 | 89,9% | 88.453 | 75,4% |
| 34 | DI Yogyakarta | 1.972.407 | 11.932 | 9.483 | 79,5% | 7.018 | 58,8% |
| 35 | Jawa Timur | 21.486.922 | 120.666 | 102.176 | 84,7% | 84.034 | 69,6% |
| 36 | Banten | 5.631.648 | 33.324 | 26.363 | 79,1% | 15.855 | 47,6% |
| 51 | Bali | 1.569.565 | 12.809 | 7.542 | 58,9% | 5.104 | 39,8% |
| 52 | Nusa Tenggara Barat | 2.703.497 | 16.243 | 13.620 | 83,9% | 11.253 | 69,3% |
| 53 | Nusa Tenggara Timur | 2.067.776 | 16.746 | 12.001 | 71,7% | 8.735 | 52,2% |
| 61 | Kalimantan Barat | 2.613.921 | 17.626 | 14.427 | 81,9% | 11.466 | 65,1% |
| 62 | Kalimantan Tengah | 1.202.122 | 7.830 | 6.275 | 80,1% | 5.095 | 65,1% |
| 63 | Kalimantan Selatan | 1.677.587 | 13.584 | 9.487 | 69,8% | 7.116 | 52,4% |
| 64 | Kalimantan Timur | 1.557.727 | 11.441 | 8.005 | 70,0% | 5.189 | 45,4% |
| 65 | Kalimantan Utara | 333.621 | 2.295 | 1.849 | 80,6% | 1.472 | 64,1% |
| 71 | Sulawesi Utara | 1.523.102 | 8.240 | 7.687 | 93,3% | 6.657 | 80,8% |
| 72 | Sulawesi Tengah | 1.444.255 | 9.462 | 7.601 | 80,3% | 6.845 | 72,3% |
| 73 | Sulawesi Selatan | 4.242.439 | 26.357 | 21.163 | 80,3% | 17.824 | 67,6% |
| 74 | Sulawesi Tenggara | 1.315.100 | 8.154 | 6.871 | 84,3% | 5.795 | 71,1% |
| 75 | Gorontalo | 660.161 | 3.539 | 3.033 | 85,7% | 2.974 | 84,0% |
| 76 | Sulawesi Barat | 717.369 | 4.219 | 3.716 | 88,1% | 3.660 | 86,8% |
| 81 | Maluku | 612.743 | 5.622 | 3.219 | 57,3% | 1.982 | 35,3% |
| 82 | Maluku Utara | 454.654 | 4.192 | 2.483 | 59,2% | 2.059 | 49,1% |
| 91 | Papua | 197.732 | 3.109 | 1.056 | 34,0% | 357 | 11,5% |
| 92 | Papua Barat | 87.671 | 1.923 | 506 | 26,3% | 245 | 12,7% |
| 93 | Papua Selatan | 57.822 | 1.770 | 344 | 19,4% | 191 | 10,8% |
| 94 | Papua Tengah | 55.525 | 4.484 | 232 | 5,2% | 114 | 2,5% |
| 95 | Papua Pegunungan | 725 | 5.850 | 4 | 0,1% | 3 | 0,1% |
| 96 | Papua Barat Daya | 145.846 | 2.156 | 866 | 40,2% | 445 | 20,6% |
| 99 | Luar Negeri | 487.498 | 3.217 | 1.823 | 56,7% | 1.315 | 40,9% |
| | **Nasional** | **128.089.145** | **823.378** | **645.858** | **78,4%** | **494.311** | **60,0%** |

Sebagai catatan khusus, data Provinsi Papua Pegunungan hanya memuat **4 rekaman TPS berangka** dari total 5.850 TPS yang ada. Oleh sebab itu, angka akumulasi 725 suara untuk provinsi ini sama sekali tidak dapat dianggap sebagai representasi perolehan suara tingkat provinsi.

#### DPR RI

| Kode | Provinsi | Σ Suara Partai | Total TPS | TPS Berangka | % Berangka | TPS Tervalidasi | % Tervalidasi |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | Aceh | 1.555.677 | 16.046 | 8.564 | 53,4% | 7.527 | 46,9% |
| 12 | Sumatera Utara | 2.287.400 | 45.875 | 14.577 | 31,8% | 14.093 | 30,7% |
| 13 | Sumatera Barat | 1.986.363 | 17.569 | 12.230 | 69,6% | 11.774 | 67,0% |
| 14 | Riau | 1.477.676 | 19.366 | 8.867 | 45,8% | 8.184 | 42,3% |
| 15 | Jambi | 1.190.756 | 11.160 | 6.785 | 60,8% | 6.188 | 55,4% |
| 16 | Sumatera Selatan | 2.472.981 | 25.985 | 13.623 | 52,4% | 12.494 | 48,1% |
| 17 | Bengkulu | 941.767 | 6.210 | 5.136 | 82,7% | 4.624 | 74,5% |
| 18 | Lampung | 3.427.637 | 25.825 | 19.205 | 74,4% | 18.077 | 70,0% |
| 19 | Kepulauan Bangka Belitung | 481.653 | 4.116 | 2.536 | 61,6% | 2.231 | 54,2% |
| 21 | Kepulauan Riau | 344.754 | 5.914 | 2.076 | 35,1% | 1.924 | 32,5% |
| 31 | DKI Jakarta | 1.713.712 | 30.766 | 9.052 | 29,4% | 7.836 | 25,5% |
| 32 | Jawa Barat | 11.584.534 | 140.457 | 61.724 | 43,9% | 58.303 | 41,5% |
| 33 | Jawa Tengah | 13.182.065 | 117.299 | 74.124 | 63,2% | 72.481 | 61,8% |
| 34 | DI Yogyakarta | 1.132.262 | 11.932 | 6.082 | 51,0% | 5.943 | 49,8% |
| 35 | Jawa Timur | 14.230.329 | 120.666 | 74.906 | 62,1% | 72.125 | 59,8% |
| 36 | Banten | 2.647.013 | 33.324 | 13.704 | 41,1% | 12.833 | 38,5% |
| 51 | Bali | 744.135 | 12.809 | 3.849 | 30,0% | 3.713 | 29,0% |
| 52 | Nusa Tenggara Barat | 1.821.732 | 16.243 | 10.416 | 64,1% | 9.685 | 59,6% |
| 53 | Nusa Tenggara Timur | 1.176.703 | 16.746 | 7.318 | 43,7% | 7.187 | 42,9% |
| 61 | Kalimantan Barat | 1.754.598 | 17.626 | 10.816 | 61,4% | 10.100 | 57,3% |
| 62 | Kalimantan Tengah | 773.900 | 7.830 | 4.472 | 57,1% | 4.130 | 52,7% |
| 63 | Kalimantan Selatan | 904.413 | 13.584 | 5.630 | 41,4% | 5.397 | 39,7% |
| 64 | Kalimantan Timur | 721.845 | 11.441 | 4.118 | 36,0% | 3.926 | 34,3% |
| 65 | Kalimantan Utara | 247.448 | 2.295 | 1.554 | 67,7% | 1.235 | 53,8% |
| 71 | Sulawesi Utara | 976.033 | 8.240 | 5.311 | 64,5% | 4.641 | 56,3% |
| 72 | Sulawesi Tengah | 1.146.018 | 9.462 | 6.427 | 67,9% | 6.137 | 64,9% |
| 73 | Sulawesi Selatan | 3.051.814 | 26.357 | 16.107 | 61,1% | 13.945 | 52,9% |
| 74 | Sulawesi Tenggara | 953.255 | 8.154 | 5.311 | 65,1% | 4.984 | 61,1% |
| 75 | Gorontalo | 581.506 | 3.539 | 2.978 | 84,1% | 2.860 | 80,8% |
| 76 | Sulawesi Barat | 633.538 | 4.219 | 3.555 | 84,3% | 3.256 | 77,2% |
| 81 | Maluku | 298.776 | 5.622 | 1.664 | 29,6% | 1.605 | 28,5% |
| 82 | Maluku Utara | 323.808 | 4.192 | 1.780 | 42,5% | 1.443 | 34,4% |
| 91 | Papua | 59.726 | 3.109 | 356 | 11,5% | 283 | 9,1% |
| 92 | Papua Barat | 24.500 | 1.923 | 160 | 8,3% | 136 | 7,1% |
| 93 | Papua Selatan | 20.672 | 1.770 | 126 | 7,1% | 122 | 6,9% |
| 94 | Papua Tengah | 16.764 | 4.484 | 72 | 1,6% | 49 | 1,1% |
| 95 | Papua Pegunungan | 232 | 5.850 | 1 | 0,0% | 1 | 0,0% |
| 96 | Papua Barat Daya | 46.985 | 2.156 | 339 | 15,7% | 305 | 14,1% |
| 99 | Luar Negeri | 373.112 | 3.217 | 1.375 | 42,7% | 1.187 | 36,9% |
| | **Nasional** | **77.308.092** | **823.378** | **426.926** | **51,9%** | **402.964** | **48,9%** |

Cakupan DPR RI konsisten lebih rendah daripada Pilpres di seluruh provinsi tanpa kecuali. Rentangnya membentang dari 84,3% di Sulawesi Barat hingga 1 rekaman TPS berangka saja di Papua Pegunungan. Sejak penarikan ulang berkas Kabupaten Lebak, jumlah total TPS Banten tercatat 33.324 pada kontes ini, sama persis dengan Pilpres.

#### DPRD Provinsi

| Kode | Provinsi | Σ Suara Partai | Total TPS | TPS Berangka | % Berangka | TPS Tervalidasi | % Tervalidasi |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | Aceh | 1.245.947 | 16.046 | 6.775 | 42,2% | 6.514 | 40,6% |
| 12 | Sumatera Utara | 1.945.014 | 45.875 | 12.623 | 27,5% | 11.878 | 25,9% |
| 13 | Sumatera Barat | 1.850.455 | 17.569 | 11.413 | 65,0% | 10.800 | 61,5% |
| 14 | Riau | 1.305.811 | 19.366 | 7.953 | 41,1% | 7.460 | 38,5% |
| 15 | Jambi | 1.097.348 | 11.160 | 6.307 | 56,5% | 5.644 | 50,6% |
| 16 | Sumatera Selatan | 2.234.423 | 25.985 | 12.256 | 47,2% | 10.983 | 42,3% |
| 17 | Bengkulu | 899.837 | 6.210 | 4.916 | 79,2% | 4.417 | 71,1% |
| 18 | Lampung | 3.037.148 | 25.825 | 17.419 | 67,5% | 16.274 | 63,0% |
| 19 | Kepulauan Bangka Belitung | 430.231 | 4.116 | 2.257 | 54,8% | 1.948 | 47,3% |
| 21 | Kepulauan Riau | 294.701 | 5.914 | 1.731 | 29,3% | 1.504 | 25,4% |
| 31 | DKI Jakarta | 1.398.438 | 30.766 | 7.454 | 24,2% | 5.944 | 19,3% |
| 32 | Jawa Barat | 9.397.633 | 140.457 | 52.241 | 37,2% | 49.028 | 34,9% |
| 33 | Jawa Tengah | 10.837.836 | 117.299 | 64.999 | 55,4% | 62.545 | 53,3% |
| 34 | DI Yogyakarta | 963.415 | 11.932 | 5.286 | 44,3% | 4.973 | 41,7% |
| 35 | Jawa Timur | 12.466.817 | 120.666 | 69.197 | 57,3% | 66.819 | 55,4% |
| 36 | Banten | 1.975.866 | 33.324 | 10.584 | 31,8% | 10.402 | 31,2% |
| 51 | Bali | 659.670 | 12.809 | 3.402 | 26,6% | 3.384 | 26,4% |
| 52 | Nusa Tenggara Barat | 1.704.387 | 16.243 | 9.517 | 58,6% | 8.578 | 52,8% |
| 53 | Nusa Tenggara Timur | 1.157.268 | 16.746 | 7.155 | 42,7% | 6.483 | 38,7% |
| 61 | Kalimantan Barat | 1.610.350 | 17.626 | 9.915 | 56,3% | 9.173 | 52,0% |
| 62 | Kalimantan Tengah | 680.264 | 7.830 | 3.981 | 50,8% | 3.480 | 44,4% |
| 63 | Kalimantan Selatan | 788.003 | 13.584 | 5.054 | 37,2% | 4.794 | 35,3% |
| 64 | Kalimantan Timur | 624.663 | 11.441 | 3.526 | 30,8% | 3.182 | 27,8% |
| 65 | Kalimantan Utara | 225.730 | 2.295 | 1.416 | 61,7% | 1.105 | 48,1% |
| 71 | Sulawesi Utara | 925.448 | 8.240 | 5.032 | 61,1% | 3.948 | 47,9% |
| 72 | Sulawesi Tengah | 1.100.974 | 9.462 | 6.149 | 65,0% | 5.695 | 60,2% |
| 73 | Sulawesi Selatan | 2.762.990 | 26.357 | 14.631 | 55,5% | 12.497 | 47,4% |
| 74 | Sulawesi Tenggara | 904.122 | 8.154 | 5.015 | 61,5% | 4.511 | 55,3% |
| 75 | Gorontalo | 569.848 | 3.539 | 2.908 | 82,2% | 2.773 | 78,4% |
| 76 | Sulawesi Barat | 617.212 | 4.219 | 3.374 | 80,0% | 2.955 | 70,0% |
| 81 | Maluku | 270.524 | 5.622 | 1.504 | 26,8% | 1.443 | 25,7% |
| 82 | Maluku Utara | 237.085 | 4.192 | 1.544 | 36,8% | 1.337 | 31,9% |
| 91 | Papua | 48.701 | 3.109 | 290 | 9,3% | 253 | 8,1% |
| 92 | Papua Barat | 19.790 | 1.923 | 132 | 6,9% | 90 | 4,7% |
| 93 | Papua Selatan | 17.582 | 1.770 | 113 | 6,4% | 112 | 6,3% |
| 94 | Papua Tengah | 16.501 | 4.484 | 68 | 1,5% | 45 | 1,0% |
| 95 | Papua Pegunungan | 531 | 5.850 | 2 | 0,0% | 2 | 0,0% |
| 96 | Papua Barat Daya | 43.824 | 2.156 | 306 | 14,2% | 273 | 12,7% |
| 99 | Luar Negeri | 0 | 3.075 | 0 | 0,0% | 0 | 0,0% |
| | **Nasional** | **66.366.387** | **823.236** | **378.445** | **46,0%** | **353.246** | **42,9%** |

Cakupan DPRD Provinsi lebih rendah lagi dibanding DPR RI, membentang dari 82,2% di Gorontalo hingga 2 rekaman TPS berangka saja di Papua Pegunungan. Satu baris pada tabel ini perlu dibaca dengan hati-hati:

- **Luar Negeri** tercatat 3.075 TPS dengan 0 TPS berangka karena pemilih luar negeri memang tidak memilih DPRD Provinsi.

Setelah penarikan ulang Sulawesi Tengah, jumlah TPS pada kontes ini identik dengan Pilpres di seluruh provinsi dalam negeri; satu-satunya selisih yang tersisa berada di Luar Negeri (lihat [Wilayah Tanpa Data DPRD Provinsi](#wilayah-tanpa-data-dprd-provinsi)).

#### DPRD Kabupaten/Kota

| Kode | Provinsi | Σ Suara Partai | Total TPS | TPS Berangka | % Berangka | TPS Tervalidasi | % Tervalidasi |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | Aceh | 1.340.114 | 16.046 | 7.065 | 44,0% | 6.666 | 41,5% |
| 12 | Sumatera Utara | 2.210.868 | 45.875 | 13.326 | 29,0% | 12.061 | 26,3% |
| 13 | Sumatera Barat | 2.052.105 | 17.569 | 12.289 | 69,9% | 11.358 | 64,6% |
| 14 | Riau | 1.396.546 | 19.366 | 8.062 | 41,6% | 7.334 | 37,9% |
| 15 | Jambi | 1.182.047 | 11.160 | 6.380 | 57,2% | 5.876 | 52,7% |
| 16 | Sumatera Selatan | 2.419.774 | 25.985 | 12.636 | 48,6% | 11.211 | 43,1% |
| 17 | Bengkulu | 967.362 | 6.210 | 4.970 | 80,0% | 4.365 | 70,3% |
| 18 | Lampung | 3.667.749 | 25.825 | 19.834 | 76,8% | 17.339 | 67,1% |
| 19 | Kepulauan Bangka Belitung | 467.321 | 4.116 | 2.320 | 56,4% | 1.936 | 47,0% |
| 21 | Kepulauan Riau | 328.656 | 5.914 | 1.868 | 31,6% | 1.544 | 26,1% |
| 31 | DKI Jakarta | 0 | 30.766 | 0 | 0,0% | 0 | 0,0% |
| 32 | Jawa Barat | 10.030.995 | 140.457 | 52.326 | 37,3% | 49.767 | 35,4% |
| 33 | Jawa Tengah | 12.556.718 | 117.299 | 68.172 | 58,1% | 63.074 | 53,8% |
| 34 | DI Yogyakarta | 1.054.644 | 11.932 | 5.483 | 46,0% | 5.034 | 42,2% |
| 35 | Jawa Timur | 13.709.694 | 120.666 | 69.458 | 57,6% | 67.776 | 56,2% |
| 36 | Banten | 2.347.445 | 33.324 | 11.729 | 35,2% | 10.830 | 32,5% |
| 51 | Bali | 693.983 | 12.809 | 3.441 | 26,9% | 3.080 | 24,0% |
| 52 | Nusa Tenggara Barat | 1.902.606 | 16.243 | 10.270 | 63,2% | 8.573 | 52,8% |
| 53 | Nusa Tenggara Timur | 1.125.282 | 16.746 | 6.796 | 40,6% | 6.174 | 36,9% |
| 61 | Kalimantan Barat | 1.744.710 | 17.626 | 10.314 | 58,5% | 9.200 | 52,2% |
| 62 | Kalimantan Tengah | 748.426 | 7.830 | 4.125 | 52,7% | 3.631 | 46,4% |
| 63 | Kalimantan Selatan | 878.431 | 13.584 | 5.194 | 38,2% | 4.666 | 34,3% |
| 64 | Kalimantan Timur | 659.344 | 11.441 | 3.555 | 31,1% | 3.236 | 28,3% |
| 65 | Kalimantan Utara | 237.289 | 2.295 | 1.482 | 64,6% | 1.205 | 52,5% |
| 71 | Sulawesi Utara | 1.073.012 | 8.240 | 5.553 | 67,4% | 4.636 | 56,3% |
| 72 | Sulawesi Tengah | 1.164.551 | 9.462 | 6.299 | 66,6% | 5.824 | 61,6% |
| 73 | Sulawesi Selatan | 2.860.845 | 26.357 | 14.843 | 56,3% | 12.751 | 48,4% |
| 74 | Sulawesi Tenggara | 959.562 | 8.154 | 5.178 | 63,5% | 4.512 | 55,3% |
| 75 | Gorontalo | 568.705 | 3.539 | 2.864 | 80,9% | 2.745 | 77,6% |
| 76 | Sulawesi Barat | 642.525 | 4.219 | 3.487 | 82,6% | 3.113 | 73,8% |
| 81 | Maluku | 300.968 | 5.622 | 1.648 | 29,3% | 1.436 | 25,5% |
| 82 | Maluku Utara | 254.343 | 4.192 | 1.632 | 38,9% | 1.374 | 32,8% |
| 91 | Papua | 51.369 | 3.109 | 299 | 9,6% | 257 | 8,3% |
| 92 | Papua Barat | 20.524 | 1.923 | 133 | 6,9% | 118 | 6,1% |
| 93 | Papua Selatan | 18.352 | 1.770 | 113 | 6,4% | 111 | 6,3% |
| 94 | Papua Tengah | 17.893 | 4.484 | 70 | 1,6% | 44 | 1,0% |
| 95 | Papua Pegunungan | 232 | 5.850 | 1 | 0,0% | 1 | 0,0% |
| 96 | Papua Barat Daya | 44.139 | 2.156 | 298 | 13,8% | 282 | 13,1% |
| 99 | Luar Negeri | 0 | 3.075 | 0 | 0,0% | 0 | 0,0% |
| | **Nasional** | **71.699.129** | **823.236** | **383.513** | **46,6%** | **353.140** | **42,9%** |

Dua baris pada tabel ini bernilai nol karena alasan regulasi, bukan karena data yang hilang:

- **DKI Jakarta** tercatat 30.766 TPS dengan 0 TPS berangka, sebab kabupaten dan kota administrasi di provinsi ini tidak memiliki DPRD sendiri sehingga tidak ada surat suara DPRD Kabupaten/Kota yang dicetak.
- **Luar Negeri** tercatat 3.075 TPS dengan 0 TPS berangka, sebab pemilih PPLN hanya memilih Pilpres dan DPR RI.

Di luar kedua wilayah tersebut, cakupan kontes ini membentang dari 82,6% di Sulawesi Barat hingga 1 rekaman TPS berangka saja di Papua Pegunungan. Terhadap penyebut 789.395 TPS pada 37 provinsi penyelenggara, cakupan nasionalnya menjadi 48,6%—lebih tinggi daripada DPRD Provinsi (47,0% pada penyebut yang sama), namun masih di bawah DPR RI (52,8%).


## Standarisasi Identitas Wilayah

Kode desa/kelurahan pada data Sirekap mengadopsi skema kode wilayah Kemendagri (PUM) 10 digit dengan format berjenjang 2/2/2/4 (Provinsi/Kabupaten/Kecamatan/Desa). Oleh karena itu, kunci identitas simpul (*node key*) ditulis apa adanya menggunakan pemisah tanda titik, misalnya: `11.01.01.2015`.

Pendekatan ini membawa sejumlah implikasi teknis:
- **Bebas dari ambiguitas nama:** *Pipeline* 2024 sepenuhnya mengandalkan pencocokan kode numerik (tanpa *string matching* nama wilayah) untuk agregasi hasil maupun batas spasial pada tingkat provinsi, kabupaten/kota, dan kecamatan.
- **Konsistensi berkas spasial:** Berkas GeoJSON desa seperti `data/gis2024/desa/11.01.01.json` secara presisi memuat seluruh desa di bawah kecamatan `11.01.01`, dengan atribut `properties.key` pada fitur yang identik dengan *node key*.
- **Inkompatibilitas dengan skema 2019:** Format kunci 2019 (`P1.1207.1208.1209`) berbasis hierarki internal KPU lama dan tidak kompatibel secara langsung dengan kode Kemendagri 2024. Fitur pengalih tahun pada antarmuka mencocokkan relasi wilayah antar-pemilu melalui rantai hierarki nama dan berhenti pada tingkatan terdalam yang berhasil dikenali.

Khusus untuk unit **Luar Negeri**, digunakan kode alfanumerik khusus seperti `99.AA.01.0001`. Setiap entitas "kabupaten" pada kode 99 hanya membawahi tepat satu PPLN, sehingga nama kabupaten dan kecamatannya diturunkan langsung dari nama satu-satunya kelurahan di bawahnya (contohnya: `SAN FRANCISCO, AMERIKA SERIKAT`). Penyesuaian ini didokumentasikan pada `name_fallbacks` sebagai `regency_name_from_village` dan `district_name_from_village` (masing-masing berjumlah 129 entri).

Nama resmi provinsi mengacu pada *master data* KPU, sedangkan nama kabupaten/kota dan kecamatan diambil dari tabel DBF *shapefile* Kemendagri. Sebanyak **26 kecamatan** yang belum tercantum dalam *shapefile* (24 di Papua Barat Daya dan 2 di Papua Pegunungan) secara otomatis diberi label generik `KECAMATAN <kode>` guna menghindari tebakan nama yang keliru. Kasus ini dicatat sebagai `district_name` pada metadata `name_fallbacks`.

## Penanganan Data Kosong, Angka Nol, dan Anomali

Aturan validasi identik untuk keempat surat suara dan dijalankan secara terpisah pada masing-masing kontes, sebab setiap surat suara membawa blok `chart` dan `administrasi`-nya sendiri.

| Metrik / Klasifikasi Anomali | Pilpres | DPR RI | DPRD Provinsi | DPRD Kab/Kota | Penjelasan Teknis |
| --- | ---: | ---: | ---: | ---: | --- |
| `blank_result_row` | 177.520 | 396.452 | 444.791 | 439.723 | Blok `chart` kosong; TPS tidak memuat data numerik hasil perolehan suara |
| `administrasi_missing_row` | 293.795 | 395.791 | 448.619 | 448.792 | Blok `administrasi` tidak tersedia; angka partisipasi tidak dapat dihitung |
| `administrasi_partial_row` | 110 | 2 | 0 | 0 | Blok `administrasi` tersedia tetapi terdapat atribut bernilai `null` |
| `invalid_stats_row` | 35.162 | 24.621 | 21.371 | 21.304 | Blok administrasi lengkap tetapi gagal pada uji konsistensi logika |
| `pengguna_ne_suara_total` | 32.912 | 22.285 | 18.325 | 18.696 | Jumlah pengguna hak pilih tidak sama dengan total surat suara (`pengguna_total_j ≠ suara_total`) |
| `option_sum_ne_suara_sah` | 23.610 | 94.800 | 76.938 | 67.434 | Akumulasi suara seluruh pilihan tidak sama dengan suara sah (`Σ pilihan ≠ suara_sah`) |
| `pengguna_gt_pemilih` | 13.008 | 8.304 | 7.010 | 6.727 | Jumlah pengguna hak pilih melebihi DPT (**dicatat secara transparan, tidak digugurkan**) |
| `suara_total_ne_sah_plus_tidak_sah` | 5.475 | 4.283 | 6.591 | 5.814 | Total surat suara tidak sama dengan penjumlahan suara sah dan tidak sah (`suara_total ≠ suara_sah + suara_tidak_sah`) |
| `partial_chart_row` | 155 | 0 | 0 | 0 | Blok `chart` memuat angka, tetapi tidak untuk seluruh pilihan pada surat suara |
| `tps_count_mismatch` | 0 | 0 | 1 | 1 | Medan `total_tps` desa tidak sama dengan jumlah baris `tps_results` yang benar-benar ada; kasus yang tersisa adalah PPLN Kuala Lumpur (U) pada kedua kontes DPRD, setelah Desa Sekarwangi pada DPR RI tertutup oleh penarikan ulang |
| `outlier_vote_row` | 0 | 0 | 0 | 0 | Tidak ditemukan perolehan suara satu pilihan > 1.000 di luar wilayah Papua dan Luar Negeri |
| `unknown_chart_option` | 0 | 0 | 0 | 0 | Blok `chart` tidak memuat kunci pilihan di luar surat suara kontes bersangkutan |
| `off_ballot_chart_option` | 0 | 0 | 0 | 0 | Blok `chart` tidak pernah memuat partai lokal Aceh (nomor 18–23) di luar Provinsi Aceh |
| `party_map_mismatch` | 0 | 0 | 0 | 0 | Kamus `partai_map` pada berkas sumber kedua kontes DPRD selalu memuat tepat 24 nomor urut yang dikenali |
| `placeholder_chart_votes` | 0 | 0 | 0 | 0 | Kunci pengganti `"null"` pada `chart` Pilpres tidak pernah memuat angka suara |

Angka `option_sum_ne_suara_sah` pada ketiga kontes legislatif (94.800 baris DPR RI, 76.938 baris DPRD Provinsi, dan 67.434 baris DPRD Kabupaten/Kota) jauh lebih tinggi daripada Pilpres. Hal ini wajar karena surat suara legislatif menuntut penjumlahan 18 kolom partai—masing-masing merupakan hasil pembacaan OCR tersendiri—sehingga peluang satu kolom salah baca jauh lebih besar dibanding penjumlahan tiga kolom paslon. Baris seperti ini tetap dipertahankan apa adanya dan hanya dicatat, tidak dikoreksi maupun digugurkan.

Dua metrik terakhir, `off_ballot_chart_option` dan `party_map_mismatch`, khusus ditambahkan untuk kedua kontes DPRD. Keduanya menjaga agar perbedaan susunan surat suara Aceh tidak menjadi tebakan diam-diam: pemeriksaan kelengkapan `chart` menuntut 24 kolom di Provinsi Aceh dan 18 kolom di provinsi lain, dan kemunculan partai lokal Aceh di luar Aceh—yang akan menandakan *scrape* tercampur antarprovinsi—akan dilaporkan, bukan diikutkan diam-diam ke dalam penjumlahan.

Perlu dicatat bahwa `blank_result_row` pada DPRD Kabupaten/Kota (439.723) memuat seluruh 30.766 baris TPS DKI Jakarta dan 3.075 baris TPS luar negeri yang kosong menurut regulasi. Di luar kedua wilayah itu, baris kosongnya berjumlah 405.882 dari 789.395—lebih sedikit daripada DPRD Provinsi pada penyebut yang sama.

Kriteria validasi data mengacu pada standar *pipeline* 2019 dengan penyesuaian khusus. Sebuah rekaman TPS dinyatakan lolos ke dalam kelompok `validated-tps` (sehingga kelima indikator partisipasinya diikutsertakan ke dalam perhitungan agregat) apabila memenuhi seluruh ketentuan berikut:

1. Blok data `administrasi` tersedia dan kelima kolomnya terisi nilai numerik.
2. Seluruh nilai numerik bernilai nonnegatif (≥ 0).
3. Tidak ada nilai yang melebihi batas wajar 1.000, kecuali untuk wilayah Papua (kode provinsi 91–96) dan Luar Negeri (kode 99), di mana mekanisme noken, pos, dan Kotak Suara Keliling (KSK) memang melayani pemilih dalam jumlah yang jauh lebih besar dari TPS reguler.
4. Memenuhi persamaan konsistensi suara: `suara_total = suara_sah + suara_tidak_sah`.
5. Memenuhi persamaan konsistensi pengguna: `pengguna_total_j = suara_total`.

**Pengecualian Aturan DPT:**
Klausul `total-pengguna ≤ total-pemilih` yang diterapkan pada *pipeline* 2019 **sengaja ditiadakan** pada Pemilu 2024. Hal ini dikarenakan kolom `total-pemilih` pada data Sirekap hanya mencatat pemilih terdaftar dalam DPT, sedangkan `total-pengguna` mencakup pemilih tambahan (DPTb) dan pemilih khusus (DPK) yang secara regulasi tidak terdaftar dalam DPT awal. Jika klausul tersebut dipaksakan, sebanyak 13.008 TPS Pilpres, 8.304 TPS DPR RI, 7.010 TPS DPRD Provinsi, dan 6.727 TPS DPRD Kabupaten/Kota yang sebenarnya sah dan wajar akan gugur secara keliru.

**Independensi Data Hasil dan Metadata Administrasi:**
Berbeda dengan skema 2019 di mana TPS tanpa angka hasil otomatis dianggap tidak valid, pada skema 2024 kedua status tersebut bersifat independen. Suatu TPS bisa saja tidak memiliki data numerik perolehan suara (*blank chart*), namun tetap memiliki blok administrasi yang valid dan utuh. Oleh karena itu, panel visualisasi menghitung TPS yang belum tervalidasi secara lugas melalui selisih `tps − validated-tps`.

Data mentah tidak pernah dimodifikasi atau dibetulkan secara sepihak. TPS yang gagal uji validasi tetap dipertahankan sebagai bagian dari rekaman data sumber; sistem hanya mengecualikan kelima metrik partisipasinya dari penjumlahan agregat tampilan antarmuka, sementara data aslinya tetap tercatat lengkap pada `contests.<id kontes>.raw_totals` di dalam `data/audit2024.json`.

## Batas Wilayah dan Data Spasial

Data geometri batas wilayah mengandalkan sumber tunggal: `SHP GIS/[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_`, yaitu *layer* `BATAS_DESAKEL_AR` rilisan Badan Informasi Geospasial (BIG) bertarikh **21 Juli 2026** (84.503 fitur PolygonZ, sistem proyeksi EPSG:4326, ukuran berkas `.shp` 2,16 GiB). Kumpulan data ini dipilih karena merupakan satu-satunya referensi lokal yang memuat kode wilayah Kemendagri secara lengkap hingga tingkat desa, sekaligus telah mengadopsi pembagian 6 provinsi di wilayah Papua (kode 91–96) pasca-pemekaran Daerah Otonomi Baru (DOB).

Perlu dipahami bahwa batas ini merefleksikan kondisi administratif per **Juli 2026**, bukan kondisi persis pada hari pemungutan suara (14 Februari 2024). Beberapa desa/kelurahan mengalami perubahan penomoran kode atau pemekaran wilayah induk di antara kedua periode tersebut. Wilayah yang tidak berhasil dipetakan dicatat apa adanya tanpa tebakan buatan (*no guessing*).

### Metodologi Pencocokan dan Penggabungan Data

- **Pencocokan Kode Desa Langsung:** Poligon desa dipetakan melalui atribut `KDEPUM` (tanpa tanda titik) yang identik dengan format kode desa KPU 2024. Sebanyak **83.009 desa** berhasil dicocokkan secara langsung (*exact code match*).
- **Pemulihan Berdasarkan Nama (*Fallback*):** Untuk desa yang tidak cocok kodenya, sistem menerapkan aturan pencocokan nama yang sangat ketat: ejaan nama kanonik harus identik, berada di dalam **kabupaten yang sama**, memiliki tepat satu kandidat kecocokan, dan poligon bersangkutan belum diklaim oleh desa lain. Sebanyak **355 desa** berhasil dipulihkan melalui metode ini.
- **Entitas Tanpa Geometri:** Sebanyak **367 desa (0,44%)** tidak memiliki geometri poligon, yang hampir seluruhnya berlokasi di Papua Barat Daya dan Papua Pegunungan. Daftar lengkap entitas ini terdokumentasi pada bagian `unmatched_villages` di dalam `data/gis2024/audit2024.json`.
- **Pembentukan Batas Wilayah Berjenjang (*Dissolve*):** Batas kecamatan, kabupaten, dan provinsi dibentuk melalui operasi peleburan (*dissolve*) berbasis awalan kode (*prefix*) dari *shapefile* itu sendiri, bukan diturunkan dari agregasi desa yang hanya ada di data pemilu. Hal ini menjamin garis batas kabupaten dan provinsi tetap utuh dan rapat (*seamless*), meskipun terdapat desa tertentu yang belum terpetakan. Khusus untuk 21 kecamatan yang kodenya tidak tercantum dalam *shapefile*, batas wilayahnya dibentuk dari gabungan (*union*) desa-desa yang berhasil dipetakan ke dalamnya dan diberi atribut penanda `matched_villages` pada `properties.match`.

### Optimalisasi Urutan Operasi Dissolve dan Penyederhanaan

Operasi penggabungan poligon desa dilakukan **sebelum** proses penyederhanaan geometri (*simplification*). Jika penyederhanaan dilakukan terlebih dahulu, batas antar-wilayah yang bertetangga akan menghasilkan celah tipis yang berantakan (*slivers* dan *gaps*) karena simpul koordinat bersama tidak lagi berhimpit. Pada versi awal *build*, urutan yang keliru menghasilkan 290.968 *ring* pada *layer* provinsi dengan ukuran berkas `provinsi.json` mencapai 24,8 MB. Setelah urutan pemrosesan diperbaiki, berkas yang sama berhasil dipadatkan menjadi hanya 21.609 *ring* dengan ukuran 3,1 MB tanpa mengurangi ketegasan detail garis pantai. Ukuran keseluruhan direktori GIS pun terpangkas dari 188 MB menjadi 133 MB.

Tingkat toleransi penyederhanaan topologi menggunakan jenjang yang sama dengan *pipeline* 2019:
- Tingkat Desa: 0,0005°
- Tingkat Kecamatan: 0,0007°
- Tingkat Kabupaten/Kota: 0,0012°
- Tingkat Provinsi: 0,0025°
- Presisi koordinat diselaraskan (*snapped*) pada toleransi 0,00001° (setara ±1,1 meter).

Waktu komputasi proses *build* memerlukan durasi 5.321 detik (~89 menit) untuk memproses 643 wilayah setingkat kabupaten/kota. Wilayah kepulauan membutuhkan porsi komputasi terbesar: Nusa Tenggara Barat membutuhkan waktu 623 detik untuk 10 kabupaten, sementara Aceh hanya memerlukan 131 detik untuk 23 kabupaten.

| Tingkat Administratif | Jumlah Fitur | Jumlah Berkas | Ukuran Total |
| --- | ---: | ---: | ---: |
| Provinsi | 38 | 1 | 3,1 MB |
| Kabupaten/Kota | 514 | 39 | 6,7 MB |
| Kecamatan | 7.272 | 643 | 24 MB |
| Desa/Kelurahan | 83.364 | 7.406 | 100 MB |
| **Total** | **91.188** | **8.089** | **133 MB** |

Selama proses validasi geometri, perbaikan otomatis hanya dilakukan pada dua kasus: 22 poligon sumber yang tidak valid diperbaiki menggunakan fungsi `make_valid`, serta penanganan terhadap 6 poligon sumber yang kosong. Tidak ada fitur keluaran akhir yang berstatus tidak valid (*invalid geometry*).

### Fitur Geometri yang Sengaja Dikecualikan

- **Area Tidak Terdefinisi:** Sebanyak **967 fitur** berlabel `Area Tidak Terdefinisi` tidak memiliki kode identitas Kemendagri. Fitur-fitur ini mencakup total area 116 km² dari keseluruhan 1.890.179 km² wilayah daratan Indonesia (hanya ~0,006%), yang seluruhnya berupa pulau-pulau kecil tak berpenghuni yang belum dimasukkan ke dalam yurisdiksi desa mana pun. Fitur ini sengaja dikeluarkan dari seluruh tingkatan hierarki administratif, dan jumlahnya dicatat pada `source.counts.skipped_undefined_area`.
- **Unit Luar Negeri (Kode 99):** Secara geografis, entitas Luar Negeri tidak memiliki representasi poligon wilayah teritorial di Indonesia. Meskipun demikian, seluruh 129 unit PPLN tetap terintegrasi penuh di dalam hierarki data, tabel perolehan suara, fitur pencarian, dan ekspor CSV, serta divisualisasikan melalui mode tampilan *grid* nonspasial.

## Menjalankan Proses Audit dan Pengujian

```powershell
python build_2024_data.py --source "D:\PROJECT\scrapping-pemilu-2024" --output data
python build_gis_2024.py
python tests/test_2024_artifacts.py
node tests/geo_mapping.test.js
python tests/test_http_smoke.py
```

Skrip pengujian `tests/test_2024_artifacts.py` mengkalkulasi ulang seluruh angka perolehan suara dari pecahan (*chunk*) tingkat desa **secara terpisah untuk setiap slot kontes**, memverifikasi kesesuaiannya dengan angka agregat (*roll-up*) kecamatan serta rekonsiliasi blok `contests` pada `data/audit2024.json`, memastikan slot kontes yang kosong tertulis sebagai `null` dan bukan deretan angka nol, dan memvalidasi setiap fitur GeoJSON (meliputi atribut *key*, *parent*, nama, tingkatan wilayah, validitas topologi geometri, serta batas *bounding box*). Seluruh angka dan statistik yang disajikan dalam dokumen audit ini bersumber langsung dari eksekusi skrip otomatis tersebut, bukan dari input manual.
