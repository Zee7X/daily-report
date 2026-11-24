"""
Worker screenshot + PDF untuk Daily Report (Report Tool).

Endpoint (HTTP, JSON):
  GET  /health                     -> {"ok": true}
  POST /screenshot {url, width, height, fullPage, blockPrivate} -> image/png
  POST /pdf        {html}          -> application/pdf

Konfigurasi lewat environment:
  WORKER_HOST            default 127.0.0.1 (pakai 0.0.0.0 di Docker)
  WORKER_PORT            default 3100
  WORKER_TOKEN           bila diisi, wajib dikirim sebagai "Authorization: Bearer <token>"
  BLOCK_PRIVATE_NETWORKS true = tolak semua request ke localhost/jaringan privat (wajib di cloud)
  SCREENSHOT_TIMEOUT_MS  default 20000 (PRD: satu screenshot < 20 detik)
  LOCALHOST_ALIAS        mis. host.docker.internal: URL localhost diarahkan ke komputer host

Browser dijalankan sekali dan dipakai ulang. Request dilayani berurutan agar ringan.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import os
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

HOST = os.environ.get("WORKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WORKER_PORT", "3100"))
TOKEN = os.environ.get("WORKER_TOKEN", "")
BLOCK_PRIVATE = os.environ.get("BLOCK_PRIVATE_NETWORKS", "false").lower() == "true"
TIMEOUT_MS = int(os.environ.get("SCREENSHOT_TIMEOUT_MS", "20000"))
MAX_BODY = 30 * 1024 * 1024

_lock = threading.Lock()
_pw = sync_playwright().start()
_browser = _pw.chromium.launch(args=["--disable-dev-shm-usage"])


def is_private_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return True
    return False


def guard_route(route):
    """Dipasang bila blockPrivate aktif: setiap request (termasuk redirect dan aset) diperiksa."""
    url = urlparse(route.request.url)
    if url.scheme in ("data", "blob", "about"):
        return route.continue_()
    if url.scheme not in ("http", "https") or not url.hostname or is_private_host(url.hostname):
        return route.abort("blockedbyclient")
    return route.continue_()


def apply_localhost_alias(url: str) -> str:
    """Di Docker, "localhost" adalah container worker itu sendiri. LOCALHOST_ALIAS=host.docker.internal
    mengarahkan URL localhost ke komputer host, tempat dev server pengguna berjalan."""
    alias = os.environ.get("LOCALHOST_ALIAS", "")
    parsed = urlparse(url)
    if alias and parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
        netloc = alias + (f":{parsed.port}" if parsed.port else "")
        return parsed._replace(netloc=netloc).geturl()
    return url


def take_screenshot(payload: dict) -> bytes:
    url = apply_localhost_alias(str(payload.get("url", "")))
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("URL harus http/https")
    block = BLOCK_PRIVATE or bool(payload.get("blockPrivate"))
    if block and is_private_host(parsed.hostname):
        raise PermissionError("URL privat/localhost tidak diizinkan di mode ini")
    width = max(320, min(3840, int(payload.get("width", 1440))))
    height = max(240, min(2160, int(payload.get("height", 900))))
    full_page = bool(payload.get("fullPage", False))

    context = _browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, ignore_https_errors=not block)
    try:
        page = context.new_page()
        if block:
            page.route("**/*", guard_route)
        page.goto(url, wait_until="networkidle", timeout=TIMEOUT_MS)
        page.wait_for_timeout(300)
        return page.screenshot(full_page=full_page, type="png", timeout=TIMEOUT_MS)
    finally:
        context.close()


def make_pdf(payload: dict) -> bytes:
    html = str(payload.get("html", ""))
    context = _browser.new_context()
    try:
        page = context.new_page()
        # PDF hanya dari HTML yang dikirim aplikasi (gambar sudah data URI). Akses jaringan ditutup.
        page.route("**/*", lambda r: r.continue_() if urlparse(r.request.url).scheme in ("data", "about") else r.abort())
        page.set_content(html, wait_until="load", timeout=30000)
        return page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
    finally:
        context.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "report-worker/1.0"

    def log_message(self, fmt, *args):  # noqa: N802 - API BaseHTTPRequestHandler
        sys.stderr.write("[worker] " + (fmt % args) + "\n")

    def _authorized(self) -> bool:
        if not TOKEN:
            return True
        given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        return hmac.compare_digest(given, TOKEN)

    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj: dict):
        self._send(status, json.dumps(obj).encode(), "application/json")

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            return self._json(200, {"ok": True, "blockPrivate": BLOCK_PRIVATE})
        return self._json(404, {"error": "not_found"})

    def do_POST(self):  # noqa: N802
        if not self._authorized():
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "bad_size"})
        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad_json"})
        try:
            with _lock:
                if self.path == "/screenshot":
                    return self._send(200, take_screenshot(payload), "image/png")
                if self.path == "/pdf":
                    return self._send(200, make_pdf(payload), "application/pdf")
            return self._json(404, {"error": "not_found"})
        except PermissionError as e:
            return self._json(403, {"error": "forbidden", "message": str(e)})
        except ValueError as e:
            return self._json(400, {"error": "bad_request", "message": str(e)})
        except PlaywrightError as e:
            return self._json(502, {"error": "browser_error", "message": str(e).splitlines()[0]})


def main():
    server = HTTPServer((HOST, PORT), Handler)
    print(f"[worker] listening on http://{HOST}:{PORT} (block private: {BLOCK_PRIVATE})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _browser.close()
        _pw.stop()


if __name__ == "__main__":
    main()
