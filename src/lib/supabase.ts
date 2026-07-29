/**
 * Тонкая обёртка над Supabase (PostgREST + Storage) через обычный fetch — без SDK,
 * по образцу чайки. Чтение — anon-ключом, запись/подпись — service-role.
 */
import 'server-only'

const BUCKET = 'assembly-sheets'
const TABLE = 'assembly_sheets'

function base(): string {
  const url = process.env.SUPABASE_URL
  if (!url) throw new Error('SUPABASE_URL не задан')
  return url.replace(/\/$/, '')
}
function anonKey(): string {
  const k = process.env.SUPABASE_ANON_KEY
  if (!k) throw new Error('SUPABASE_ANON_KEY не задан')
  return k
}
function serviceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY не задан')
  return k
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
}

/** Одна строка отчёта в текстовом виде (без фото) — для показа в интерфейсе. */
export type SheetDataRow = { [column: string]: string | number }

export interface SheetRow {
  id: number
  window_start: string
  window_end: string
  filename: string
  storage_path: string
  demands: number
  positions: number
  rows: number
  data: SheetDataRow[]
  created_at: string
}

/** Загрузка XLSX в приватный бакет (service-role, upsert). */
export async function uploadXlsx(path: string, buffer: Buffer): Promise<void> {
  const key = serviceKey()
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'x-upsert': 'true'
    },
    body: buffer as any,
    cache: 'no-store'
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Storage upload failed: ${res.status} ${t}`)
  }
}

/** Upsert строки метаданных отчёта по окну (service-role, обходит RLS). */
export async function insertSheet(row: Omit<SheetRow, 'id' | 'created_at'>): Promise<void> {
  const key = serviceKey()
  const res = await fetch(
    `${base()}/rest/v1/${TABLE}?on_conflict=window_start,window_end`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify(row),
      cache: 'no-store'
    }
  )
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Insert failed: ${res.status} ${t}`)
  }
}

/** Список готовых листов, свежие сверху (anon, публичный SELECT по RLS). */
export async function listSheets(limit = 60): Promise<SheetRow[]> {
  const key = anonKey()
  const res = await fetch(
    `${base()}/rest/v1/${TABLE}?select=*&order=created_at.desc&limit=${limit}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`List failed: ${res.status}`)
  return res.json()
}

/** Учётка панели по логину (service-role, обходит RLS). null — если нет. */
export async function getAuthUser(
  username: string
): Promise<{ salt: string; password_hash: string } | null> {
  const key = serviceKey()
  const res = await fetch(
    `${base()}/rest/v1/moi_sklad_auth?select=salt,password_hash&username=eq.${encodeURIComponent(username)}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Auth lookup failed: ${res.status}`)
  const rows = (await res.json()) as { salt: string; password_hash: string }[]
  return rows[0] ?? null
}

/** Подписанная ссылка на скачивание файла из приватного бакета (service-role). */
export async function signedUrl(path: string, expiresIn = 3600): Promise<string> {
  const key = serviceKey()
  const res = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn }),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(`Sign failed: ${res.status}`)
  const data = (await res.json()) as { signedURL: string }
  return `${base()}/storage/v1${data.signedURL}`
}
