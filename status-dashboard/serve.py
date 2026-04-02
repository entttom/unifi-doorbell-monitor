from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8123
ROOT = Path(__file__).resolve().parent
CALENDAR_URL_FILE = ROOT / "config" / "calendar-url.txt"


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/calendar"):
            self.serve_calendar()
            return

        if self.path.startswith("/favicon.ico"):
            self.send_response(204)
            self.end_headers()
            return

        super().do_GET()

    def serve_calendar(self):
        try:
            calendar_url = CALENDAR_URL_FILE.read_text(encoding="utf-8").strip()
        except FileNotFoundError:
            self.send_error(404, "calendar-url.txt not found")
            return

        if not calendar_url:
            self.send_error(400, "calendar-url.txt is empty")
            return

        request = Request(
            calendar_url,
            headers={
                "User-Agent": "raspi-status-dashboard/1.0",
                "Accept": "text/calendar,text/plain;q=0.9,*/*;q=0.8",
            },
        )

        try:
            with urlopen(request, timeout=15) as response:
                body = response.read()
        except HTTPError as error:
            self.send_error(502, f"Calendar upstream error: {error.code}")
            return
        except URLError as error:
            self.send_error(502, f"Calendar upstream error: {error.reason}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/calendar; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), DashboardHandler)
    print(f"Serving dashboard on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
