#!/usr/bin/env python3
"""Local preview server for macOS/Linux: python3 tools/serve.py [--port 8123] [--mock-api]

--mock-api answers /api/* with the canned responses in tools/mock-api.json, so the booking UI and admin
can be clicked through without Cloudflare/Stripe. Same behaviour as tools/serve.ps1 on Windows.
"""
import argparse
import functools
import http.server
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    mock = {}
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json',
                      '.woff2': 'font/woff2', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def _mock(self):
        path = self.path.split('?', 1)[0]
        if '/api/' not in path:
            return False
        key = path.split('/api/', 1)[1]
        if key not in self.mock:
            return False
        body = json.dumps(self.mock[key]).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def do_GET(self):
        if not self._mock():
            super().do_GET()

    do_POST = do_PUT = do_PATCH = do_DELETE = lambda self: self._mock() or self.send_error(404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8123)
    ap.add_argument('--mock-api', action='store_true')
    a = ap.parse_args()
    if a.mock_api:
        Handler.mock = json.loads((ROOT / 'tools' / 'mock-api.json').read_text(encoding='utf-8'))
    server = http.server.ThreadingHTTPServer(('localhost', a.port), functools.partial(Handler, directory=str(ROOT)))
    print(f'Serving {ROOT} on http://localhost:{a.port}/')
    server.serve_forever()


if __name__ == '__main__':
    main()
