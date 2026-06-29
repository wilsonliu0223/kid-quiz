#!/usr/bin/env python3
"""本機開發用靜態伺服器：禁用快取、正確 WASM MIME，與 GitHub 線上版同一套檔案。"""
from __future__ import annotations

import http.server
import os
import re
import socketserver

PORT = 8787
ROOT = os.path.dirname(os.path.abspath(__file__))


class DevHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".data": "application/octet-stream",
        ".mjs": "text/javascript",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        path = self.path.split("?", 1)[0].lower()
        if path.endswith((".js", ".html", ".css", ".mjs", ".wasm", ".data")) or "/engines/" in path:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        if args and str(args[1]) not in ("200", "304"):
            super().log_message(format, *args)


def read_app_version() -> str:
    config = os.path.join(ROOT, "js", "config.site.js")
    try:
        with open(config, encoding="utf-8") as f:
            m = re.search(r'APP_VERSION:\s*"([^"]+)"', f.read())
            if m:
                return m.group(1)
    except OSError:
        pass
    return "?"


def rapfi_data_ok() -> bool:
    p = os.path.join(ROOT, "engines", "rapfi", "full", "rapfi.data")
    try:
        return os.path.getsize(p) > 30_000_000
    except OSError:
        return False


def main() -> None:
    os.chdir(ROOT)
    ver = read_app_version()
    rapfi = "OK (~40MB)" if rapfi_data_ok() else "缺少 engines/rapfi/full/rapfi.data"

    print()
    print("  Kid Quiz — 本機開發伺服器")
    print(f"  版本: v{ver}（讀取本機檔案，與 GitHub main 同步後即最新）")
    print(f"  涅槃 Rapfi 權重: {rapfi}")
    print()
    print(f"  瀏覽器: http://127.0.0.1:{PORT}/")
    print(f"          http://localhost:{PORT}/")
    print("  手機同 WiFi: http://【電腦IP】:8787")
    print()
    print("  已停用 JS/WASM 快取；改程式後重新整理即可，不必清快取。")
    print("  按 Ctrl+C 結束")
    print()

    with socketserver.TCPServer(("", PORT), DevHandler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
