#!/usr/bin/env node
/**
 * Применяет db/migrations/*.sql по порядку. Каждый файл — в транзакции.
 * Уже применённые фиксируются в таблице _migrations и пропускаются.
 * Запуск: node scripts/migrate.mjs  (нужен DATABASE_URL).
 */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('migrate: DATABASE_URL не задан')
    process.exit(1)
  }
  const client = new pg.Client({
    connectionString,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  })
  await client.connect()
  try {
    await client.query(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`
    )
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const done = new Set(
      (await client.query('select name from _migrations')).rows.map((r) => r.name)
    )

    for (const file of files) {
      if (done.has(file)) {
        console.log(`migrate: skip ${file}`)
        continue
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`migrate: apply ${file}`)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('insert into _migrations(name) values ($1)', [file])
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        console.error(`migrate: FAILED ${file}:`, e.message)
        process.exit(1)
      }
    }
    console.log('migrate: done')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('migrate: error', e)
  process.exit(1)
})
