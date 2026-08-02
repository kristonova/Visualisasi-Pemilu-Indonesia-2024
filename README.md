# Peta Hasil Pemilu Indonesia 2024

`pemilu-2024.html` + `app.js` — penjelajah hasil pemilu berjenjang:
**Nasional → Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa**, dengan tab
Presiden / DPR RI / DPRD Provinsi / DPRD Kab-Kota / DPD.

## Status data

| Bagian | Sumber | Status |
| --- | --- | --- |
| Hierarki wilayah (35 prov, 612 kab/kota, 7.331 kecamatan) | `src/dataprov-kec.csv` hasil scraping Anda | **asli** |
| 7.805 kelurahan/desa di 400 kecamatan | `src/pilpres/*.csv` (40 berkas TPS) | **asli** |
| DPT, pengguna hak pilih, suara sah/tidak sah, jumlah TPS pada 400 kecamatan itu | agregat TPS asli 2019 | **asli** |
| Basis Pilpres 2019 (Jokowi–Ma'ruf vs Prabowo–Sandi) | agregat TPS asli 2019 | **asli** |
| Wilayah lain (DPT dsb.) | imputasi berjenjang, diskalakan ke DPT nasional 2024 (204.807.222) | contoh |
| Semua perolehan suara 2024 | model deterministik, agregat nasional dikunci ke pangsa resmi 2024 | **contoh** |

Sumber scraping asli menargetkan `pemilu2019.kpu.go.id`. Untuk 2024, arahkan ulang
scraper ke endpoint KPU 2024 lalu ganti berkas data (lihat di bawah).

## Mengganti dengan data 2024 asli

1. Jalankan ulang scraper ke sumber KPU 2024, hasilkan CSV dengan kolom yang sama.
2. Bangun ulang `data/wilayah.json` dengan bentuk:

```json
{"prov":[{"k":"1","n":"ACEH","kab":[{"k":"1492","n":"ACEH BARAT",
  "kec":[{"k":"1753","n":"WOYLA BARAT",
    "kel":[{"n":"ALUE KEUMUNING","d":[p01,p02,dpt,pengguna,sah,tidak_sah,jml_tps]}]}]}]}]}
```

3. Untuk memakai angka 2024 langsung (bukan model), ganti `buildElection()` di `app.js`
   agar membaca perolehan per opsi dari berkas, lalu hapus blok penyetelan proporsional.
4. Ganti daftar calon DPD di konstanta `DPD` dengan nama calon sebenarnya per provinsi.

## Geometri peta

- Provinsi & kabupaten/kota: TopoJSON `ghapsara/indonesia-atlas` (diambil saat runtime).
- Kecamatan & kelurahan: tidak ada geometri publik ringan, jadi ditampilkan sebagai
  **grid wilayah** dengan peta penunjuk lokasi. Bila folder GIS Anda berisi shapefile
  kecamatan/desa, konversi ke TopoJSON dan pasang di `loadKab()`-style loader.

## Pintasan

`1`–`5` ganti jenis pemilu · `/` cari wilayah · `Esc`/`Backspace` naik satu tingkat
