/**
 * Шифрование секретов (WB-токены, пароли МойСклад) для хранения в БД.
 * AES-256-GCM через Web Crypto (работает и в Node, и в Edge).
 *
 * Формат хранимой строки: base64(iv[12] || ciphertext || tag) — всё склеено,
 * tag GCM (16 байт) subtle.encrypt дописывает в конец ciphertext.
 * Ключ — WB_TOKEN_ENC_KEY: 64 hex-символа (32 байта) ИЛИ любая строка (тогда
 * берём её SHA-256 как 32-байтный ключ).
 */
import 'server-only'

const IV_LEN = 12

function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

let keyPromise: Promise<CryptoKey> | null = null

async function rawKeyBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const raw = process.env.WB_TOKEN_ENC_KEY
  if (!raw) throw new Error('WB_TOKEN_ENC_KEY не задан в окружении')
  // 64 hex = 32 байта — используем как есть; иначе хэшируем до 32 байт.
  if (raw.length === 64) {
    const bytes = hexToBytes(raw)
    if (bytes) return bytes
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return new Uint8Array(digest)
}

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const bytes = await rawKeyBytes()
      return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt'
      ])
    })()
  }
  return keyPromise
}

/** Зашифровать строку → base64(iv||ciphertext||tag). */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  )
  const ctBytes = new Uint8Array(ct)
  const packed = new Uint8Array(iv.length + ctBytes.length)
  packed.set(iv, 0)
  packed.set(ctBytes, iv.length)
  return b64encode(packed)
}

/** Расшифровать base64(iv||ciphertext||tag) → исходная строка. */
export async function decryptSecret(packedB64: string): Promise<string> {
  const key = await getKey()
  const packed = b64decode(packedB64)
  const iv = packed.slice(0, IV_LEN)
  const ct = packed.slice(IV_LEN)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}

/** Последние 4 символа секрета — для безопасного отображения в UI. */
export function last4(secret: string): string {
  return secret.slice(-4)
}
