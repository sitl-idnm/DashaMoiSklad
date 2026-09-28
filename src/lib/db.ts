/**
 * Доступ к PostgreSQL напрямую (node-postgres) — без ORM, ради скорости и
 * контроля. Один пул на процесс; в dev кэшируем в globalThis, чтобы hot-reload
 * не плодил пулы. Только серверный код.
 */
import 'server-only'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL не задан в окружении')
  const pool = new Pool({
    connectionString,
    // Умеренный пул: приложение + воркер работают на одном сервере.
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // TLS только если явно попросили (managed-БД); локальный Postgres — без него.
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  })
  pool.on('error', (err) => {
    // Соединение в простое умерло — pg сам переоткроет; просто не роняем процесс.
    console.error('[pg] idle client error:', err.message)
  })
  return pool
}

export function pool(): Pool {
  if (!global.__pgPool) global.__pgPool = createPool()
  return global.__pgPool
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

/** Выполнить запрос, вернуть массив строк. Параметры — только через $1,$2… */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const res = await pool().query<T>(text, params)
  return res.rows
}

/** Одна строка или null. */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** Транзакция: колбэк получает клиента; commit/rollback автоматически. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
