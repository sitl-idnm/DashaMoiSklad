#!/usr/bin/env node
/**
 * Планировщик автозадач (замена Vercel Cron). Самопланирующиеся setTimeout,
 * устойчивы к дрейфу. Раз в сутки в заданное время МСК дёргают эндпоинты
 * с Bearer CRON_SECRET:
 *   11:02 — /api/orders/ship    (перевод заказов ВБ в «Отгружен»)
 *   11:05 — /api/generate       (сборка листа за сутки)
 *
 * Env:
 *   APP_URL         базовый URL (default http://app:3000)
 *   CRON_SECRET     секрет (обязателен)
 *   CRON_HOUR_MSK   час листа (default 11)   CRON_MIN_MSK   минута (default 5)
 *   SHIP_HOUR_MSK   час отгрузки (default 11) SHIP_MIN_MSK   минута (default 2)
 */
const APP_URL = (process.env.APP_URL || 'http://app:3000').replace(/\/$/, '')
const SECRET = process.env.CRON_SECRET
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

if (!SECRET) {
  console.error('worker: CRON_SECRET не задан — выключаюсь')
  process.exit(1)
}

/** Миллисекунды до следующего HOUR:MIN по Москве. */
function msUntilNext(hour, min) {
  const now = Date.now()
  const wall = new Date(now + MSK_OFFSET_MS)
  const target = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), hour, min, 0)
  let targetUtc = target - MSK_OFFSET_MS
  if (targetUtc <= now) targetUtc += 24 * 60 * 60 * 1000
  return targetUtc - now
}

async function hit(path) {
  try {
    const res = await fetch(`${APP_URL}${path}`, { headers: { Authorization: `Bearer ${SECRET}` } })
    const text = await res.text().catch(() => '')
    console.log(`worker: ${path} → ${res.status} ${text.slice(0, 200)}`)
  } catch (e) {
    console.error(`worker: ${path} failed:`, e?.message || e)
  }
}

function scheduleJob(name, hour, min, path) {
  const delay = msUntilNext(hour, min)
  console.log(`worker: ${name} через ${Math.round(delay / 1000)}s (цель ${hour}:${String(min).padStart(2, '0')} МСК)`)
  setTimeout(async () => {
    await hit(path)
    scheduleJob(name, hour, min, path) // на следующие сутки
  }, delay)
}

const GEN_H = Number(process.env.CRON_HOUR_MSK ?? 11)
const GEN_M = Number(process.env.CRON_MIN_MSK ?? 5)
const SHIP_H = Number(process.env.SHIP_HOUR_MSK ?? 11)
const SHIP_M = Number(process.env.SHIP_MIN_MSK ?? 2)

console.log(`worker: старт, APP_URL=${APP_URL}`)
scheduleJob('ship', SHIP_H, SHIP_M, '/api/orders/ship')
scheduleJob('generate', GEN_H, GEN_M, '/api/generate')
