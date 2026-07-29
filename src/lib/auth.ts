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

/** Создать подписанный токен сессии. Возвращает null, если секрет не задан. */
export async function createSessionToken(): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const sig = await sign(String(exp), key)
  return `${exp}.${sig}`
}

/** Проверить токен: подпись валидна и срок не истёк. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const key = secret()
  if (!key || !token) return false
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = await sign(expStr, key)
  // Сравнение постоянной длины.
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
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
