# Audit data Pemilu dan batas wilayah 2024

Dokumen ini merangkum audit yang dapat dibaca manusia. Inventaris per berkas,
SHA-256, total mentah per kolom, contoh anomali, dan rekonsiliasi keluaran ada
di `data/audit2024.json`. Audit GIS ditulis oleh `build_gis_2024.py` ke
`data/gis2024/audit2024.json`.

Bacalah [`AUDIT_2019.md`](AUDIT_2019.md) untuk tahun sebelumnya. Kedua tahun
tidak berbagi kunci wilayah dan tidak boleh disilangkan lewat kode.

## Ringkasan satu paragraf

Sumber 2024 adalah scrape KPU Sirekap yang **tidak lengkap secara angka**: KPU
menghentikan penayangan konversi angka pada Maret 2024 dan menyisakan citra
formulir C1 untuk sebagian TPS. Dari 823.378 rekaman TPS yang terkumpul,
**645.836 (78,4%) memuat angka hasil** dan 177.542 tidak. Kekosongan itu
berkorelasi kuat dengan wilayah: 94,8% di Bengkulu, 0,1% di Papua Pegunungan.
Total 128.087.760 suara paslon pada dashboard karena itu adalah penjumlahan TPS
yang berangka, **bukan hasil penetapan nasional**, dan peta pemenang di enam
provinsi Papua tidak layak dibaca sebagai hasil wilayah tersebut.

## Hasil pemilu

Satu sumber, tanpa penggabungan lintas scrape:

| Sumber | Peran | Akar |
| --- | --- | --- |
| Scrape KPU Sirekap (`hhcw/ppwp`) | Pilpres 2024 per TPS | `...\scrapping-pemilu-2024\data_pilpres` |
| Master wilayah KPU | Nama 38 provinsi + Luar Negeri | `...\scrapping-pemilu-2024\master_data\wilayah_provinsi.json` |
| DBF shapefile desa Kemendagri Juli 2026 | Nama kabupaten/kota dan kecamatan | `SHP GIS\[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_` |

Pipeline membaca **643 berkas JSON** (978 MiB) berisi 83.860 kelurahan/desa dan
823.378 rekaman TPS. Tidak ada rekaman yang ditolak: seluruh baris masuk ke
artefak, dan yang tidak memuat angka disimpan sebagai kosong lewat statistik
`blank-tps`, bukan sebagai nol yang dilaporkan.

| Angka | Nilai |
| --- | ---: |
| Berkas sumber | 643 |
| Kelurahan/desa | 83.860 |
| Kecamatan | 7.406 |
| Kabupaten/kota (termasuk 129 PPLN) | 643 |
| Kelompok provinsi (38 + Luar Negeri) | 39 |
| Rekaman TPS | 823.378 |
| TPS memuat angka hasil | 645.836 (78,4%) |
| TPS lolos konsistensi metadata | 494.311 (60,0%) |
| Σ suara 01 Anies–Muhaimin | 31.377.721 |
| Σ suara 02 Prabowo–Gibran | 75.339.817 |
| Σ suara 03 Ganjar–Mahfud | 21.370.222 |
| Σ seluruh paslon | 128.087.760 |

### Perbandingan dengan hasil resmi KPU

Angka penetapan resmi KPU **tidak disertakan** dalam repository ini dan tidak
dipakai sebagai pembanding otomatis di mana pun dalam pipeline. Bandingkan
sendiri terhadap keputusan penetapan hasil Pemilu 2024 sebelum mengutip angka
apa pun dari dashboard. Yang dapat diverifikasi dari data di repository ini
hanyalah rasio internal: 78,4% rekaman TPS memuat angka, dan proporsi itulah
yang menjelaskan selisih terhadap angka nasional mana pun.

### Cakupan angka per provinsi

`TPS berangka` adalah rekaman TPS yang memuat setidaknya satu nilai paslon.
`Tervalidasi` adalah rekaman yang blok `administrasi`-nya lolos seluruh
pemeriksaan konsistensi dan karena itu dijumlahkan ke lima total partisipasi.

| Kode | Provinsi | Σ suara paslon | TPS | Berangka | % | Tervalidasi | % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | Aceh | 2.513.229 | 16.046 | 12.798 | 79,8% | 9.392 | 58,5% |
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
| | **Nasional** | **128.087.760** | **823.378** | **645.836** | **78,4%** | **494.311** | **60,0%** |

Papua Pegunungan memuat **empat** rekaman TPS berangka dari 5.850. Angka
725 suara pada provinsi itu tidak boleh dibaca sebagai hasil provinsi.

## Identitas wilayah

Kode kelurahan/desa pada Sirekap adalah kode Kemendagri (PUM) sepanjang sepuluh
karakter dengan tata letak 2/2/2/4. Key simpul karena itu ditulis apa adanya
dengan titik: `11.01.01.2015`. Konsekuensinya:

- tidak ada pencocokan nama di mana pun dalam pipeline 2024, baik untuk hasil
  maupun untuk batas wilayah pada tingkat provinsi, kabupaten, dan kecamatan;
- `data/gis2024/desa/11.01.01.json` berisi persis desa-desa kecamatan
  `11.01.01`, dan `properties.key` fitur sama dengan key simpul; serta
- key 2019 (`P1.1207.1208.1209`) dan key 2024 tidak sebanding. Penukar tahun
  mencocokkan wilayah lewat rantai nama dan berhenti pada tingkat terdalam yang
  masih ditemukan.

Luar Negeri memakai kode alfanumerik seperti `99.AA.01.0001`; setiap
"kabupaten" 99 berisi tepat satu PPLN, sehingga nama kabupaten dan kecamatannya
diambil dari nama satu-satunya kelurahan di bawahnya, misalnya
`SAN FRANCISCO, AMERIKA SERIKAT`. Hal itu dicatat sebagai
`regency_name_from_village` dan `district_name_from_village` (masing-masing 129)
pada `name_fallbacks`.

Nama provinsi berasal dari master KPU; nama kabupaten/kota dan kecamatan
berasal dari DBF shapefile Kemendagri. Sebanyak **26 kecamatan** tidak ada di
shapefile — 24 di Papua Barat Daya dan 2 di Papua Pegunungan — dan diberi label
generik `KECAMATAN <kode>` daripada ditebak. Itu tercatat sebagai
`district_name` pada `name_fallbacks`.

## Arti kosong, nol, dan anomali

| Hitungan anomali | Jumlah | Arti |
| --- | ---: | --- |
| `blank_result_row` | 177.542 | `chart` kosong; TPS tanpa angka hasil sama sekali |
| `administrasi_missing_row` | 293.817 | Tidak ada blok `administrasi`; partisipasi tidak dapat dihitung |
| `administrasi_partial_row` | 88 | Blok ada tetapi sebagian kolomnya `null` |
| `invalid_stats_row` | 35.162 | Blok lengkap tetapi gagal pemeriksaan konsistensi |
| `pengguna_ne_suara_total` | 32.912 | `pengguna_total_j ≠ suara_total` |
| `option_sum_ne_suara_sah` | 23.610 | Σ tiga paslon ≠ `suara_sah` |
| `pengguna_gt_pemilih` | 13.008 | Pengguna melebihi DPT; **dilaporkan, tidak ditolak** |
| `suara_total_ne_sah_plus_tidak_sah` | 5.475 | `suara_total ≠ suara_sah + suara_tidak_sah` |
| `outlier_vote_row` | 0 | Tidak ada suara paslon di atas 1.000 di luar Papua/luar negeri |

Aturan validasi mengikuti pipeline 2019 kecuali satu klausa. Sebuah TPS masuk
ke `validated-tps`, dan karena itu lima total partisipasinya dijumlahkan, bila:

1. blok `administrasi` ada dan seluruh lima kolomnya numerik;
2. seluruh nilai tidak negatif;
3. seluruh nilai tidak melebihi 1.000 kecuali di Papua (91–96) dan luar negeri
   (99), tempat agregasi noken serta pos/KSK memang melampaui ukuran TPS biasa;
4. `suara_total = suara_sah + suara_tidak_sah`; dan
5. `pengguna_total_j = suara_total`.

Klausa `total-pengguna ≤ total-pemilih` yang berlaku pada 2019 **sengaja tidak
diberlakukan** pada 2024, karena `total-pemilih` di sini adalah DPT sedangkan
`total-pengguna` mencakup pemilih DPTb dan DPK yang menurut definisi tidak ada
dalam DPT. Menerapkannya akan membuang 13.008 TPS yang sebenarnya sah.

Perbedaan definisi lain terhadap 2019: pada 2019 sebuah baris kosong otomatis
tidak tervalidasi, sedangkan pada 2024 keduanya independen — sebuah TPS dapat
kosong angka hasilnya tetapi memiliki blok administrasi yang utuh. Karena itu
teks cakupan pada aplikasi menghitung TPS tidak tervalidasi sebagai
`tps − validated-tps` dan tidak mengklaim angka itu lepas dari TPS kosong.

Nilai mentah tidak diperbaiki secara diam-diam. TPS yang gagal validasi tetap
dihitung sebagai rekaman sumber; hanya lima total partisipasinya yang tidak
dijumlahkan, dan angkanya tetap ada pada `raw_totals` di `data/audit2024.json`.

## Batas wilayah

Sumber tunggal: `SHP GIS/[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_`,
yaitu layer `BATAS_DESAKEL_AR` BIG edisi **21 Juli 2026**, 84.503 fitur
PolygonZ, EPSG:4326, `.shp` 2,16 GiB. Dataset ini dipilih karena satu-satunya
koleksi lokal yang sekaligus memuat kode Kemendagri lengkap sampai desa **dan**
memakai kode provinsi Papua pasca-pemekaran 91–96.

Ini adalah batas **Juli 2026**, bukan batas pada hari pemungutan suara
14 Februari 2024. Sebagian desa berubah nomor atau induk di antara dua tanggal
itu; yang tidak dapat dicocokkan dicatat, bukan ditebak.

### Cara penggabungan

- **Desa** digabung lewat `KDEPUM` tanpa titik, yang identik dengan kode
  kelurahan/desa KPU 2024. Sebanyak **83.009** desa cocok langsung lewat kode.
- **Fallback nama** dipakai untuk sisanya dan dibatasi ketat: nama kanonik
  identik, di dalam **kabupaten yang sama**, kandidatnya tepat satu, dan
  poligonnya belum diklaim desa lain. Sebanyak **355** desa dipulihkan begitu.
- **367 desa (0,44%)** tetap tanpa geometri, hampir seluruhnya di Papua Barat
  Daya dan Papua Pegunungan. Daftarnya lengkap di
  `data/gis2024/audit2024.json` pada `unmatched_villages`.
- **Kecamatan, kabupaten, dan provinsi didisolve dari awalan kode shapefile
  itu sendiri**, bukan dari desa yang tercakup hasil pemilu. Itu membuat batas
  kabupaten dan provinsi tetap rapat meskipun ada desa yang tidak tercocokkan.
  Untuk 21 kecamatan yang kodenya tidak dikenal shapefile, batas disusun dari
  desa yang berhasil dicocokkan ke dalamnya dan ditandai `matched_villages`
  pada `properties.match`.

### Urutan disolve

Desa digabung **sebelum** disederhanakan. Menyederhanakan lebih dulu lalu
menggabung meninggalkan satu sliver di belakang setiap batas bersama, karena dua
tetangga tidak lagi sepakat soal titik di antara mereka. Versi pertama build ini
melakukan urutan yang salah dan menghasilkan 290.968 ring pada layer provinsi
serta `provinsi.json` sebesar 24,8 MB. Setelah urutannya diperbaiki, berkas yang
sama menjadi 21.609 ring dan 3,1 MB tanpa mengurangi detail garis pantai, dan
seluruh folder turun dari 188 MB menjadi 133 MB.

Toleransi penyederhanaan mengikuti tangga yang sama dengan pipeline 2019: desa
0,0005°, kecamatan 0,0007°, kabupaten 0,0012°, provinsi 0,0025°. Koordinat
di-snap ke presisi 0,00001° (≈1,1 m).

Build terakhir memakan 5.321 detik (89 menit) untuk 643 kabupaten/kota. Provinsi
kepulauan mendominasi biayanya: Nusa Tenggara Barat sendiri menghabiskan 623
detik untuk 10 kabupaten, sedangkan Aceh hanya 131 detik untuk 23 kabupaten.

| Tingkat | Fitur | Berkas | Ukuran |
| --- | ---: | ---: | ---: |
| Provinsi | 38 | 1 | 3,1 MB |
| Kabupaten/kota | 514 | 39 | 6,7 MB |
| Kecamatan | 7.272 | 643 | 24 MB |
| Desa/kelurahan | 83.364 | 7.406 | 100 MB |
| **Total** | **91.188** | **8.089** | **133 MB** |

Perbaikan geometri yang tercatat hanya dua jenis: 22 poligon sumber tidak valid
dan diperbaiki dengan `make_valid`, serta 6 poligon sumber kosong. Tidak ada
fitur keluaran yang tidak valid.

### Yang sengaja dikeluarkan

Sebanyak **967 fitur** berlabel `Area Tidak Terdefinisi` tidak memiliki kode
Kemendagri. Totalnya 116 km² dari 1.890.179 km² (0,006%) dan seluruhnya berupa
pulau kecil yang belum dilekatkan ke desa mana pun. Fitur itu dikeluarkan dari
seluruh tingkat karena bukan unit administratif; jumlahnya dicatat pada
`source.counts.skipped_undefined_area`.

Luar Negeri (kode 99) tidak mempunyai geometri administratif Indonesia sama
sekali. 129 PPLN tetap ada pada hierarki, hasil, tabel, pencarian, dan ekspor,
dan tampil melalui grid wilayah.

## Menjalankan audit

```powershell
python build_2024_data.py --source "D:\PROJECT\scrapping-pemilu-2024" --output data
python build_gis_2024.py
python tests/test_2024_artifacts.py
node tests/geo_mapping.test.js
python tests/test_http_smoke.py
```

`tests/test_2024_artifacts.py` menghitung ulang seluruh angka dari chunk desa
dan membandingkannya dengan roll-up kecamatan sekaligus dengan
`data/audit2024.json`, lalu memvalidasi setiap fitur GeoJSON: key, parent, nama,
tingkat, validitas geometri, dan bbox. Angka pada dokumen ini berasal dari
keluaran skrip-skrip tersebut, bukan dari catatan manual.
