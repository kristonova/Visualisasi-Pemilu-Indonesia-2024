from __future__ import annotations

import json
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


def fetch(base_url: str, path: str) -> bytes:
    with urllib.request.urlopen(f"{base_url}/{path}", timeout=10) as response:
        assert response.status == 200, (path, response.status)
        return response.read()


def main() -> None:
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        index = fetch(base_url, "index.html")
        assert b"app.js" in index
        assert b'id="yearseg"' in index, "penukar tahun harus ada di halaman"
        app = fetch(base_url, "app.js")
        assert b"'data/election2019'" in app and b"'data/election2024'" in app
        assert b"'data/gis'" in app and b"'data/gis2024'" in app
        assert b"--color-accent" in fetch(base_url, "assets/modernist/styles.css")

        # Setiap tahun harus benar-benar dapat dilayani, bukan hanya disebut
        # dalam kode: hierarki, chunk hasil provinsi pertama, dan GeoJSON.
        for election_file, leaf, gis_dir, kab, province_count in (
            ("data/election2019.json", "data/election2019/P1.json", "data/gis", "P1", 34),
            ("data/election2024.json", "data/election2024/11.json", "data/gis2024", "11", 38),
        ):
            election = json.loads(fetch(base_url, election_file))
            assert election["schema"] == 2
            assert fetch(base_url, leaf)
            provinces = json.loads(fetch(base_url, f"{gis_dir}/provinsi.json"))
            assert provinces["type"] == "FeatureCollection"
            assert len(provinces["features"]) == province_count, (
                f"{gis_dir}: {len(provinces['features'])} provinsi, diharapkan {province_count}"
            )
            assert fetch(base_url, f"{gis_dir}/kab/{kab}.json")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)

    print("test_http_smoke.py: app, election chunks, and GIS served for 2019 and 2024")


if __name__ == "__main__":
    main()
