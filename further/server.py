"""Loopback-only development HTTP server, with an explicit static-file allowlist."""

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .ai import ProviderError, create_plan
from .domain import Goal, SAMPLE_PEERS, rank_peers

ROOT = Path(__file__).resolve().parent.parent
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}


def load_local_env():
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if key.strip() in {
                    "FURTHER_AI_MODE", "MODEL_API_KEY", "MODEL_API_BASE_URL",
                    "MODEL_ID", "MODEL_API_TIMEOUT_SECONDS",
                }:
                    os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Do not log user learning goals, headers, or credentials.
        pass

    def reply(self, status, data, content_type="application/json; charset=utf-8"):
        body = data if isinstance(data, bytes) else json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        host = self.headers.get("Host", "")
        port = self.server.server_port
        if host not in ("127.0.0.1:" + str(port), "localhost:" + str(port)):
            self.reply(403, {"error": "This development server accepts loopback requests only."})
            return False
        origin = self.headers.get("Origin")
        if origin and origin != "http://" + host:
            self.reply(403, {"error": "Cross-origin requests are not permitted."})
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path == "/api/health":
            self.reply(200, {"status": "ok", "ai_mode": os.environ.get("FURTHER_AI_MODE", "demo"), "sample_peers": True})
        elif path == "/api/peers":
            self.reply(200, {"peers": SAMPLE_PEERS, "sample": True})
        elif path in ASSETS:
            name, mime = ASSETS[path]
            self.reply(200, (ROOT / "web" / name).read_bytes(), mime)
        else:
            self.reply(404, {"error": "Not found."})

    def do_POST(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path not in ("/api/matches", "/api/plan"):
            self.reply(404, {"error": "Not found."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 8192:
                self.reply(413, {"error": "Request body must be between 1 and 8192 bytes."})
                return
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self.reply(415, {"error": "Send application/json."})
                return
            body = json.loads(self.rfile.read(size).decode("utf-8"))
            goal = Goal.from_dict(body)
            if path == "/api/matches":
                self.reply(200, {"matches": rank_peers(goal), "sample": True, "matching_mode": "keyword-baseline"})
            else:
                self.reply(200, create_plan(goal))
        except (ValueError, UnicodeDecodeError) as error:
            self.reply(400, {"error": str(error)})
        except ProviderError as error:
            self.reply(502, {"error": str(error)})


def main():
    parser = argparse.ArgumentParser(description="Run the Further local starter.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    load_local_env()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Further: http://127.0.0.1:" + str(server.server_port), flush=True)
    print("Local starter only. AI mode: " + os.environ.get("FURTHER_AI_MODE", "demo"), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
