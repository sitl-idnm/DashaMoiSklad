#!/usr/bin/env node
/**
 * Создать/обновить учётку панели.
 * Использование: node scripts/seed-user.mjs <username> <password> [admin|operator]
 * Пароль хэшируется как SHA-256(salt + password) — совпадает с src/lib/auth.ts.
 * Нужен DATABASE_URL.
 */
import crypto from 'node:crypto'
import pg from 'pg'

const [, , username, password, roleArg] = process.argv
const role = roleArg === 'admin' ? 'admin' : roleArg === 'operator' ? 'operator' : 'admin'

if (!username || !password) {
  console.error('Использование: node scripts/seed-user.mjs <username> <password> [admin|operator]')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('seed-user: DATABASE_URL не задан')
  process.exit(1)
}

const salt = crypto.randomBytes(16).toString('hex')
const password_hash = crypto.createHash('sha256').update(salt + password).digest('hex')

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined
})

await client.connect()
try {
  await client.query(
    `insert into moi_sklad_auth (username, salt, password_hash, role)
     values ($1,$2,$3,$4)
     on conflict (username) do update set
       salt=excluded.salt, password_hash=excluded.password_hash, role=excluded.role`,
    [username, salt, password_hash, role]
  )
  console.log(`seed-user: готово — ${username} (${role})`)
} finally {
  await client.end()
}
