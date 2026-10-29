# Development server: like `python3 -m http.server`, but tells the browser
# not to cache, so edited files show up on a normal reload.
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


handler = partial(NoCacheHandler, directory=Path(__file__).parent)
print('Serving on http://localhost:8000')
ThreadingHTTPServer(('', 8000), handler).serve_forever()
