#!/usr/bin/env python3
"""Tiny zero-dependency dev server for the Abruzzi K2 map.

It serves the static files in this folder and, additionally, generates a
virtual `/config.js` that exposes the variables from `.env` to the browser as
`window.ENV`. This keeps tokens out of the committed source while still
requiring no build step.

Usage:
    python3 serve.py            # serves on http://localhost:8765
    PORT=3000 python3 serve.py  # custom port

Real shell environment variables take precedence over values in `.env`.
"""

import http.server
import socketserver
import os
import json
import pathlib

PORT = int(os.environ.get("PORT", "8765"))
ROOT = pathlib.Path(__file__).parent.resolve()


def load_env():
    """Parse .env (KEY=VALUE), letting real env vars override file values."""
    env = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                env[key] = value
    # Allow process environment to override anything declared in .env.
    for key in list(env.keys()):
        if os.environ.get(key):
            env[key] = os.environ[key]
    return env


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/config.js":
            self._serve_config()
            return
        return super().do_GET()

    def end_headers(self):
        # Dev server: never let the browser cache static assets, so edits to
        # JS/CSS/HTML always show on a normal reload (no hard-refresh needed).
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _serve_config(self):
        body = "window.ENV = " + json.dumps(load_env()) + ";\n"
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass  # keep the terminal quiet


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    keys = list(load_env().keys())
    status = ", ".join(keys) if keys else "none found"
    with Server(("", PORT), Handler) as httpd:
        print(f"Abruzzi K2 expedition map → http://localhost:{PORT}")
        print(f".env variables exposed to the browser: {status}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
