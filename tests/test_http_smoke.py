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
        assert b"app.js" in fetch(base_url, "index.html")
        assert b"data/election2019/" in fetch(base_url, "app.js")
        assert b"--color-accent" in fetch(base_url, "assets/modernist/styles.css")

        election = json.loads(fetch(base_url, "data/election2019.json"))
        assert election["schema"] == 2
        assert fetch(base_url, "data/election2019/P1.json")

        provinces = json.loads(fetch(base_url, "data/gis/provinsi.json"))
        assert provinces["type"] == "FeatureCollection"
        assert len(provinces["features"]) == 34
        assert fetch(base_url, "data/gis/kab/P1.json")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)

    print("test_http_smoke.py: app, election chunks, and GIS served successfully")


if __name__ == "__main__":
    main()
