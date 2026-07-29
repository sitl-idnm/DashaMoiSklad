# -*- coding: utf-8 -*-
"""
Локальный веб-сервер панели «Лист сборки» (без внешних зависимостей).

Маршруты:
  GET  /                 -> web/index.html
  GET  /api/window       -> текущее окно выборки {start, end}
  POST /api/generate     -> собирает отчёт, отдаёт JSON (строки + статистика)
  GET  /api/download     -> последний сформированный .xlsx
  GET  /img/<photo_id>   -> миниатюра товара из последнего отчёта

Запуск:  python server.py   (по умолчанию http://127.0.0.1:8000)
"""
import os
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import moysklad_report as core

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

# Последний сформированный отчёт (в памяти)
_last = {"xlsx": None, "images": {}, "filename": None}
_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("  [http]", self.address_string(), fmt % args)

    # ---------- helpers ----------
    def _send(self, code, body=b"", ctype="application/octet-stream", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False),
                   "application/json; charset=utf-8")

    # ---------- GET ----------
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/" or path == "/index.html":
            fp = os.path.join(WEB_DIR, "index.html")
            if os.path.exists(fp):
                with open(fp, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            else:
                self._send(404, "index.html not found", "text/plain; charset=utf-8")
            return

        if path == "/api/window":
            start, end = core.compute_window()
            self._json(200, {"start": start.strftime("%Y-%m-%d %H:%M"),
                             "end": end.strftime("%Y-%m-%d %H:%M"),
                             "hour": core.WINDOW_HOUR})
            return

        if path == "/api/download":
            with _lock:
                data = _last["xlsx"]
                fname = _last["filename"] or "assembly_sheet.xlsx"
            if not data:
                self._send(404, "Сначала сформируйте отчёт", "text/plain; charset=utf-8")
                return
            self._send(200, data,
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                       {"Content-Disposition": f'attachment; filename="{fname}"'})
            return

        if path.startswith("/img/"):
            pid = path[len("/img/"):]
            with _lock:
                fp = _last["images"].get(pid)
            if fp and os.path.exists(fp):
                with open(fp, "rb") as f:
                    self._send(200, f.read(), "image/png",
                               {"Cache-Control": "max-age=3600"})
            else:
                self._send(404, "no image", "text/plain; charset=utf-8")
            return

        self._send(404, "Not found", "text/plain; charset=utf-8")

    # ---------- POST ----------
    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/generate":
            self._send(404, "Not found", "text/plain; charset=utf-8")
            return

        # тело запроса (опционально: hour, download_images)
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            body = {}
        hour = int(body.get("hour", core.WINDOW_HOUR))
        download_images = bool(body.get("download_images", True))

        try:
            result = core.generate_report(hour=hour, download_images=download_images)
        except Exception as e:
            self._json(500, {"error": str(e)})
            return

        start, end = result["start"], result["end"]
        fname = f"assembly_sheet_{start:%Y-%m-%d_%H-%M}__{end:%Y-%m-%d_%H-%M}.xlsx"
        with _lock:
            _last["xlsx"] = result["xlsx"]
            _last["images"] = result["images"]
            _last["filename"] = fname

        # строки для превью (без внутренних полей)
        rows = []
        for r in result["records"]:
            rows.append({
                "cell": r["Ячейка"],
                "product": r["Товар"],
                "photo": f"/img/{r['photo_id']}" if r.get("photo_id") else None,
                "article": r["Артикул"],
                "barcode": r["Штрихкод"],
                "qty": r["Кол-во"],
                "client": r["Клиент"],
                "order": r["№ заказа"],
                "label": r["Ссылка на этикетку"],
                "date": r["Дата заказа"],
            })

        self._json(200, {
            "window": {"start": start.strftime("%Y-%m-%d %H:%M"),
                       "end": end.strftime("%Y-%m-%d %H:%M")},
            "stats": result["stats"],
            "rows": rows,
            "filename": fname,
        })


def main():
    os.makedirs(WEB_DIR, exist_ok=True)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Панель запущена: http://{HOST}:{PORT}")
    print("Ctrl+C для остановки.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")
        srv.shutdown()


if __name__ == "__main__":
    main()
