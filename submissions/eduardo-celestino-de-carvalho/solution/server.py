"""Servidor local do Lead Kanban, apenas com a biblioteca padrão do Python.

Uso, a partir de ``solution/``::

    python server.py            # http://localhost:8000
    python server.py --port 8080 --open
"""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import gzip
import json
import webbrowser

from leadscore.board import build_board
from leadscore.data import ARCHIVE_NAME, download_archive, load_dataset


ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"


BACKTEST = ROOT / "experiments" / "g3-focus-backtest.json"


def load_payload() -> bytes:
    archive = download_archive(ROOT / "data" / ARCHIVE_NAME)
    board = build_board(load_dataset(archive))
    # Resultado agregado do backtest, se gerado, para o dashboard e o procedimento.
    if BACKTEST.exists():
        result = json.loads(BACKTEST.read_text(encoding="utf-8"))
        board["backtest"] = [{"cutoff": c["cutoff"], "top5": c["top5_per_agent"],
                              "cleanup": c["lanes"]["encerrar"],
                              "phases": c["focus_outcome_by_phase"]} for c in result["cutoffs"]]
        board["robustness"] = result.get("robustness_summary")
    return gzip.compress(json.dumps(board, ensure_ascii=False).encode("utf-8"))


class BoardHandler(SimpleHTTPRequestHandler):
    payload: bytes = b""
    # No Windows, o registro pode mapear .js como text/plain e bloquear módulos ES.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}

    def do_GET(self):
        if self.path.split("?")[0] == "/api/board":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(self.payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(self.payload)
            return
        super().do_GET()

    def send_head(self):
        # Sem cache condicional: o navegador sempre recebe a versão atual da interface.
        del self.headers["If-Modified-Since"]
        return super().send_head()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002 - assinatura da stdlib
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Lead Kanban")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open", action="store_true", help="abrir o navegador")
    args = parser.parse_args()

    print("Lendo e validando as quatro tabelas do CRM...")
    BoardHandler.payload = load_payload()
    server = ThreadingHTTPServer(("127.0.0.1", args.port),
                                 partial(BoardHandler, directory=str(WEB_DIR)))
    url = f"http://localhost:{args.port}"
    print(f"Lead Kanban disponível em {url}  (Ctrl+C para encerrar)")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
