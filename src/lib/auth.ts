/**
 * Сессия панели: httpOnly-cookie с HMAC-подписью. Работает и в Node (route
 * handlers), и в Edge (middleware) — используем только Web Crypto (crypto.subtle).
 * Формат токена: "<expEpochSec>.<base64url(HMAC-SHA256(secret, exp))>".
 */

export const SESSION_COOKIE = 'mois_session'
export const SESSION_TTL_SEC = 60 * 60 * 12 // 12 часов

function secret(): string | null {
  return process.env.AUTH_SESSION_SECRET || null
}

// base64url без spread-операторов (чтобы не зависеть от downlevelIteration).
function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(data: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return toBase64Url(new Uint8Array(sig))
}

export type Role = 'admin' | 'operator'
export interface SessionPayload {
  exp: number
  username: string
  role: Role
}

// username кодируем в base64url, чтобы точки/разделители не ломали формат токена.
function encField(s: string): string {
  return toBase64Url(new TextEncoder().encode(s))
}
function decField(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/**
 * Создать подписанный токен сессии. Формат: "<exp>.<user_b64>.<role>.<sig>",
 * где sig = HMAC(secret, "<exp>.<user_b64>.<role>"). Возвращает null без секрета.
 */
export async function createSessionToken(
  username: string,
  role: Role
): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const data = `${exp}.${encField(username)}.${role}`
  const sig = await sign(data, key)
  return `${data}.${sig}`
}

/** Разобрать и проверить токен. Возвращает полезную нагрузку или null. */
export async function parseSessionToken(
  token: string | undefined
): Promise<SessionPayload | null> {
  const key = secret()
  if (!key || !token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [expStr, userB64, role, sig] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null
  if (role !== 'admin' && role !== 'operator') return null
  const expected = await sign(`${expStr}.${userB64}.${role}`, key)
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null
  let username = ''
  try {
    username = decField(userB64)
  } catch {
    return null
  }
  return { exp, username, role }
}

/** Проверить токен: подпись валидна и срок не истёк. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await parseSessionToken(token)) !== null
}

/** SHA-256(salt + password) в hex — совпадает с тем, как хэш лежит в БД. */
export async function hashPassword(salt: string, password: string): Promise<string> {
  const enc = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(salt + password))
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return hex
}
