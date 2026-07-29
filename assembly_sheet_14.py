# -*- coding: utf-8 -*-
"""
CLI: сформировать «Лист сборки» из «Мой склад» и сохранить XLSX на диск.

Учётные данные берутся из окружения (MOYSKLAD_LOGIN / MOYSKLAD_PASSWORD или .env).
Папка вывода — из OUTPUT_FOLDER (по умолчанию ./output).

Вся бизнес-логика — в moysklad_report.py (общая с веб-панелью).
"""
import os
from datetime import datetime

import moysklad_report as core

OUTPUT_FOLDER = os.environ.get("OUTPUT_FOLDER", os.path.join(os.getcwd(), "output"))


def main():
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    start, end = core.compute_window()
    print(f"Окно выборки: с {start:%Y-%m-%d %H:%M} по {end:%Y-%m-%d %H:%M}")

    result = core.generate_report(start=start, end=end, download_images=True)
    stats = result["stats"]
    print(f"Отгрузок: {stats['demands']} · позиций: {stats['positions']} · "
          f"строк: {stats['rows']}")

    if stats["rows"] == 0:
        print("За это окно данных не найдено.")
        return

    fname = f"assembly_sheet_{start:%Y-%m-%d_%H-%M}__{end:%Y-%m-%d_%H-%M}.xlsx"
    path = os.path.join(OUTPUT_FOLDER, fname)
    with open(path, "wb") as f:
        f.write(result["xlsx"])

    print(f"\nГотово. Файл сохранён: {path}")


if __name__ == "__main__":
    main()
