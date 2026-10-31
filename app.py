import http.server
import os
import urllib.parse

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        return super().translate_path(parsed.path)

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def end_headers(self):
        self._send_cors()
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_POST(self):
        body = b"null"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # Version with pistons is also available as the guide page.
        if parsed.path == "/guide":
            self.path = "/piston.html" + (("?" + parsed.query) if parsed.query else "")
            super().do_GET()
            return

        fs_path = self.translate_path(parsed.path)
        if not os.path.isfile(fs_path):
            if "." in os.path.basename(parsed.path):
                super().do_GET()
                return
            self.path = "/index.html" + (("?" + parsed.query) if parsed.query else "")
        super().do_GET()


if __name__ == "__main__":
    os.chdir(ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving Logic Arrows copy at http://127.0.0.1:{PORT}/")
        httpd.serve_forever()
PY