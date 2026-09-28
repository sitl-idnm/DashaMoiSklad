#!/usr/bin/env node
/**
 * Планировщик автосбора (замена Vercel Cron). Раз в сутки в заданное время МСК
 * дёргает /api/generate с Bearer CRON_SECRET. Без внешних зависимостей —
 * самопланирующийся setTimeout, устойчив к дрейфу.
 *
 * Env:
 *   APP_URL        базовый URL приложения (default http://app:3000)
 *   CRON_SECRET    секрет авторизации (обязателен)
 *   CRON_HOUR_MSK  час запуска по Москве (default 11)
 *   CRON_MIN_MSK   минута (default 5)
 */
const APP_URL = (process.env.APP_URL || 'http://app:3000').replace(/\/$/, '')
const SECRET = process.env.CRON_SECRET
const HOUR_MSK = Number(process.env.CRON_HOUR_MSK ?? 11)
const MIN_MSK = Number(process.env.CRON_MIN_MSK ?? 5)
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

if (!SECRET) {
  console.error('worker: CRON_SECRET не задан — выключаюсь')
  process.exit(1)
}

/** Миллисекунды до следующего HOUR:MIN по Москве. */
function msUntilNext() {
  const now = Date.now()
  const wall = new Date(now + MSK_OFFSET_MS) // UTC-поля == московское настенное время
  const target = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    HOUR_MSK,
    MIN_MSK,
    0
  )
  let targetUtc = target - MSK_OFFSET_MS
  if (targetUtc <= now) targetUtc += 24 * 60 * 60 * 1000
  return targetUtc - now
}

async function runGenerate() {
  try {
    const res = await fetch(`${APP_URL}/api/generate`, {
      headers: { Authorization: `Bearer ${SECRET}` }
    })
    const text = await res.text().catch(() => '')
    console.log(`worker: generate → ${res.status} ${text.slice(0, 200)}`)
  } catch (e) {
    console.error('worker: generate failed:', e?.message || e)
  }
}

function schedule() {
  const delay = msUntilNext()
  console.log(`worker: следующий автосбор через ${Math.round(delay / 1000)}s`)
  setTimeout(async () => {
    await runGenerate()
    schedule() // перепланируем на следующие сутки
  }, delay)
}

console.log(`worker: старт, цель ${HOUR_MSK}:${String(MIN_MSK).padStart(2, '0')} МСК, APP_URL=${APP_URL}`)
schedule()
