"""A minimal HTTP endpoint. It only has to exist: on Fly.io, a request to the app starts the stopped
machine (the database sends one when there is work); the worker itself then reads the queue."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class _Wake(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = b"awake\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_HEAD = do_GET

    def log_message(self, format: str, *args: object) -> None:
        pass  # one log line per job is enough


def serve_wake(port: int, host: str = "0.0.0.0") -> ThreadingHTTPServer:
    """Serves 200 on every GET in a background thread; `shutdown()` stops it."""
    server = ThreadingHTTPServer((host, port), _Wake)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
