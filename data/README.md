# Generated runtime data

Folder ini berisi artefak yang langsung dimuat browser dan karena itu dilacak
oleh Git untuk GitHub Pages:

- `wilayah.json`: hierarchy key KPU 2019;
- `election2019.json` dan `election2019/*.json`: metadata, agregat, serta chunk
  hasil per provinsi;
- `gis/provinsi.json`, `gis/kab/`, `gis/kec/`, dan `gis/desa/`: GeoJSON lokal;
- `audit2019.json` dan `gis/audit2019.json`: bukti inventaris serta integritas.

Jangan mengedit JSON secara manual. Bangun ulang melalui `build_2019_data.py`
atau `build_gis_data.py`, lalu jalankan seluruh pemeriksaan dalam `tests/`.
