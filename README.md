# DashaMoiSklad — Лист сборки из «Мой склад»

Веб-панель, которая собирает **отгрузки за сутки (13:00–13:00)** из
[«Мой склад»](https://dev.moysklad.ru/doc/api/remap/1.2/) в **лист сборки** и
выгружает XLSX. Отчёт формируется **автоматически по расписанию** (Vercel Cron)
и складывается в Supabase; на панели можно скачать готовые листы или собрать вручную.

- **Стек:** Next.js 14 (App Router) на Vercel, Supabase (Storage + таблица), exceljs.
- **Панель:** дизайн-система KIM в винно-серой палитре.
- **Python-версия** (в папке-репозитории, `*.py`) сохранена как локальный CLI-референс,
  на Vercel не деплоится (см. `.vercelignore`).

## Что попадает в лист сборки

| Колонка | Источник |
|---|---|
| Ячейка | `demand.positions.slot` → `«<зона> / <ячейка>»` |
| Товар / Артикул | `assortment.name` / `assortment.article` |
| Фото | миниатюра товара (встраивается в XLSX) |
| Штрихкод | штрихкоды товара, **только начинающиеся на «4»**; если несколько — все |
| Кол-во | `position.quantity` |
| Клиент | `demand.organization` |
| № заказа | `demand.name` |
| Ссылка на этикетку | доп. поле заказа «Этикетка MPsklad» |

Отчёт строится **от отгрузок** — даёт ячейку (slot) и совпадение номера заказа с отгрузкой.

## Архитектура

```
Vercel Cron (13:05 МСК = 10:05 UTC) ──► GET /api/generate
                                           │  buildReport (МойСклад) → XLSX (exceljs)
                                           ▼
                              Supabase: Storage (bucket assembly-sheets)
                                        + таблица assembly_sheets
                                           ▲
Панель  ──► GET /api/sheets ───────────────┘  (список + подписанные ссылки)
        └─► POST /api/generate  (кнопка «Сформировать сейчас»)
```

## Развёртывание

### 1. Supabase
1. Создать проект (или использовать существующий).
2. **SQL Editor** → выполнить `supabase/schema.sql` (таблица + приватный бакет + RLS).
3. **Settings → API** → скопировать `Project URL`, `anon` и `service_role` ключи.

### 2. Локально
```bash
npm install
cp .env.example .env    # заполнить MOYSKLAD_* и SUPABASE_*
npm run dev             # http://localhost:3000
```

### 3. Vercel
1. Импортировать репозиторий в Vercel (Framework preset: **Next.js**).
2. **Settings → Environment Variables** — добавить:
   `MOYSKLAD_LOGIN`, `MOYSKLAD_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Deploy. Крон из `vercel.json` подхватится автоматически (`5 10 * * *` = 13:05 МСК).

## Переменные окружения

| Переменная | Зачем |
|---|---|
| `MOYSKLAD_LOGIN`, `MOYSKLAD_PASSWORD` | доступ к API «Мой склад» |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | чтение списка листов (панель) |
| `SUPABASE_SERVICE_ROLE_KEY` | запись XLSX/строк (генерация) |
| `CRON_SECRET` | защита `/api/generate` от посторонних вызовов |

## Структура

```
src/app/page.tsx            — панель (дашборд + инструмент)
src/app/api/generate/route  — генерация (GET=cron, POST=вручную)
src/app/api/sheets/route    — список готовых листов + подписанные ссылки
src/lib/moysklad.ts         — окно, запросы к API, сборка записей
src/lib/xlsx.ts             — сборка XLSX (exceljs, встраивание фото)
src/lib/supabase.ts         — Storage/таблица через REST (без SDK)
src/lib/generate.ts         — оркестрация: собрать → залить в Supabase
supabase/schema.sql         — таблица assembly_sheets + бакет
vercel.json                 — расписание крона
```

## CLI-референс (Python)

Локальный запуск без веба сохраняет XLSX на диск:
```bash
pip install -r requirements.txt   # requests, openpyxl, Pillow
python assembly_sheet_14.py       # окно берётся автоматически
```
