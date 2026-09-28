/**
 * Базовый HTTP-клиент Wildberries. Токен инъектируется по scope; ретрай/бэкофф
 * на 429 (уважаем Retry-After / X-Ratelimit-Retry) и на сетевые сбои — по образцу
 * msGet из moysklad.ts. Только серверный код.
 */
import 'server-only'

export type WbScope = 'content' | 'marketplace' | 'prices' | 'statistics'

// Базовые домены по scope. У ВБ единый суффикс *.wildberries.ru, домен зависит от API.
const HOSTS: Record<WbScope, string> = {
  content: 'https://content-api.wildberries.ru',
  marketplace: 'https://marketplace-api.wildberries.ru',
  prices: 'https://discounts-prices-api.wildberries.ru',
  statistics: 'https://statistics-api.wildberries.ru'
}

export class WbError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`WB ${status}: ${body.slice(0, 300)}`)
    this.status = status
    this.body = body
  }
}

export interface WbRequest {
  scope: WbScope
  token: string
  path: string // начинается с "/", либо полный URL
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  timeoutMs?: number
  maxRetries?: number
}

function buildUrl(req: WbRequest): string {
  const baseUrl = req.path.startsWith('http') ? req.path : `${HOSTS[req.scope]}${req.path}`
  if (!req.query) return baseUrl
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (v !== undefined && v !== null) usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
}

function retryAfterMs(res: Response): number {
  // ВБ отдаёт X-Ratelimit-Retry (секунды) либо стандартный Retry-After.
  const h = res.headers.get('X-Ratelimit-Retry') || res.headers.get('Retry-After')
  const n = Number(h)
  if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, 60000)
  return 2000
}

/**
 * Выполнить запрос к ВБ. Возвращает распарсенный JSON (или текст, если не JSON).
 * Бросает WbError на не-2xx (после исчерпания ретраев на 429).
 */
export async function wbFetch<T = any>(req: WbRequest): Promise<T> {
  const url = buildUrl(req)
  const method = req.method || 'GET'
  const timeoutMs = req.timeoutMs ?? 30000
  const maxRetries = req.maxRetries ?? 5
  let netAttempts = 0
  let rlAttempts = 0

  for (;;) {
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: req.token,
          'Accept-Encoding': 'gzip',
          ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (e) {
      if (++netAttempts > 4) throw e
      await sleep(400 * netAttempts)
      continue
    }

    if (res.status === 429) {
      if (++rlAttempts > maxRetries) {
        throw new WbError(429, await res.text().catch(() => ''))
      }
      await sleep(retryAfterMs(res))
      continue
    }

    const text = await res.text().catch(() => '')
    if (!res.ok) throw new WbError(res.status, text)

    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }
}

/** Лёгкая проверка валидности токена по scope: делаем дешёвый запрос. */
export async function wbPing(scope: WbScope, token: string): Promise<boolean> {
  try {
    // Универсальный дешёвый вызов, специфичный для каждого API.
    if (scope === 'content') {
      await wbFetch({
        scope,
        token,
        method: 'POST',
        path: '/content/v2/get/cards/list',
        body: { settings: { cursor: { limit: 1 }, filter: { withPhoto: -1 } } },
        maxRetries: 1
      })
      return true
    }
    if (scope === 'marketplace') {
      await wbFetch({ scope, token, path: '/api/v3/warehouses', maxRetries: 1 })
      return true
    }
    if (scope === 'statistics') {
      // Требует dateFrom; берём заведомо валидную дату.
      await wbFetch({
        scope,
        token,
        path: '/api/v1/supplier/stocks',
        query: { dateFrom: '2020-01-01' },
        maxRetries: 1
      })
      return true
    }
    // prices: список товаров с ценами.
    await wbFetch({
      scope,
      token,
      path: '/api/v2/list/goods/filter',
      query: { limit: 1, offset: 0 },
      maxRetries: 1
    })
    return true
  } catch (e) {
    if (e instanceof WbError && (e.status === 401 || e.status === 403)) return false
    // Прочие ошибки (сеть/лимиты) не считаем «невалидным токеном».
    throw e
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
