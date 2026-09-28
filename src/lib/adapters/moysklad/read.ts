/**
 * Чтение товаров МойСклад для сверки (dry-run). НИЧЕГО не пишет.
 * Использует общие креды окружения (MOYSKLAD_LOGIN/PASSWORD) — единый аккаунт.
 * Позже, при мультиаккаунте, сюда придут per-client креды из ms_credentials.
 * Только серверный код.
 */
import 'server-only'

const BASE = 'https://api.moysklad.ru/api/remap/1.2'

function authHeader(): string {
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD
  if (!login || !password) {
    throw new Error('MOYSKLAD_LOGIN / MOYSKLAD_PASSWORD не заданы в окружении')
  }
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

async function msGet(path: string): Promise<any> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  let netAttempts = 0
  for (;;) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: authHeader(), 'Accept-Encoding': 'gzip' },
        cache: 'no-store',
        signal: AbortSignal.timeout(30000)
      })
    } catch (e) {
      if (++netAttempts > 4) throw e
      await new Promise((r) => setTimeout(r, 400 * netAttempts))
      continue
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('X-Lognex-Retry-After') || 2000)
      await new Promise((r) => setTimeout(r, retry || 2000))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`МойСклад ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json()
  }
}

export interface MsProduct {
  id: string
  name: string
  article: string
  barcodes: string[]
}

function extractBarcodes(assortment: any): string[] {
  const out: string[] = []
  for (const bc of assortment.barcodes || []) {
    if (!bc || typeof bc !== 'object') continue
    for (const v of Object.values(bc)) {
      if (typeof v === 'string' && !out.includes(v)) out.push(v)
    }
  }
  return out
}

/**
 * Индекс товаров МойСклад: по баркоду и по артикулу.
 * Тянем product + variant (модификации), т.к. баркоды часто на вариантах.
 */
export async function loadMoyskladIndex(): Promise<{
  byBarcode: Map<string, MsProduct>
  byArticle: Map<string, MsProduct>
  count: number
}> {
  const byBarcode = new Map<string, MsProduct>()
  const byArticle = new Map<string, MsProduct>()
  let count = 0

  for (const entity of ['product', 'variant']) {
    let offset = 0
    for (;;) {
      const data = await msGet(`/entity/${entity}?limit=100&offset=${offset}`)
      const rows: any[] = data.rows || []
      for (const a of rows) {
        const p: MsProduct = {
          id: a.id,
          name: a.name || '',
          article: a.article || a.code || '',
          barcodes: extractBarcodes(a)
        }
        count++
        for (const bc of p.barcodes) if (!byBarcode.has(bc)) byBarcode.set(bc, p)
        if (p.article && !byArticle.has(p.article)) byArticle.set(p.article, p)
      }
      const size = data.meta?.size ?? 0
      if (rows.length === 0 || offset + rows.length >= size) break
      offset += data.meta?.limit ?? 100
    }
  }

  return { byBarcode, byArticle, count }
}
