# Generated runtime data

Folder ini berisi artefak yang langsung dimuat browser dan karena itu dilacak
oleh Git untuk GitHub Pages:

- `wilayah.json`: hierarchy key KPU 2019;
- `election2019.json` dan `election2019/*.json`: metadata, agregat, serta chunk
  hasil per provinsi;
- `gis/provinsi.json`, `gis/kab/`, `gis/kec/`, dan `gis/desa/`: GeoJSON lokal;
- `audit2019.json` dan `gis/audit2019.json`: bukti inventaris serta integritas.

Key setiap tingkat adalah ID wilayah KPU resmi, termasuk kelurahan, sehingga
`P1.1207.1208.1209` tetap sama pada setiap build. Sebelumnya token desa hanya
posisi alfabetis di dalam kecamatan dan bergeser tiap kali data sumber berubah;
tautan lama ke node desa karena itu tidak lagi berlaku.

Hasil Pilpres berasal dari ekspor KawalPemilu per provinsi, sedangkan DPR RI dan
kedua DPRD berasal dari scrape KPU legacy. Kolom `total-pemilih` dan
`total-pengguna` pada Pilpres dipulihkan per TPS dari scrape legacy karena
ekspor tersebut tidak memuatnya.

Jangan mengedit JSON secara manual. Bangun ulang melalui `build_2019_data.py`
atau `build_gis_data.py`, lalu jalankan seluruh pemeriksaan dalam `tests/`.
