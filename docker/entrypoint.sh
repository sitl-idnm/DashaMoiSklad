#!/bin/sh
# Применяем миграции, затем запускаем standalone-сервер Next.
set -e

echo "entrypoint: ожидаю БД и применяю миграции…"
node scripts/migrate.mjs

echo "entrypoint: старт приложения на :${PORT:-3000}"
exec node server.js
