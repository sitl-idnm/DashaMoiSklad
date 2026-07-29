/**
 * Ядро отчёта «Лист сборки» из «Мой склад» (JSON API 1.2).
 * Порт логики из Python-версии. Только серверный код.
 */

const BASE = 'https://api.moysklad.ru/api/remap/1.2'
const ETIKETKA_ATTR = 'Этикетка MPsklad'
const WINDOW_HOUR = 13
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000 // Москва = UTC+3, без перехода на летнее время

export const COLUMNS = [
  'Ячейка', 'Товар', 'Фото', 'Артикул', 'Штрихкод', 'Кол-во',
  'Клиент', '№ заказа', 'Ссылка на этикетку', 'Дата заказа'
] as const

export interface Record {
  Ячейка: string
  Товар: string
  Артикул: string
  Штрихкод: string
  'Кол-во': number | string
  Клиент: string
  '№ заказа': string
  'Ссылка на этикетку': string
  'Дата заказа': string
  'Стикер'?: string
  image: Buffer | null
}

export interface ReportResult {
  startStr: string
  endStr: string
  records: Record[]
  stats: { demands: number; positions: number; rows: number; revenue: number }
}

// ---------------- Авторизация ----------------
function authHeader(): string {
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD
  if (!login || !password) {
    throw new Error('MOYSKLAD_LOGIN / MOYSKLAD_PASSWORD не заданы в окружении')
  }
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

// ---------------- Запрос с ретраем на 429 ----------------
async function msGet(path: string): Promise<any> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  for (;;) {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), 'Accept-Encoding': 'gzip' },
      cache: 'no-store'
    })
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

async function msGetBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), 'Accept-Encoding': 'gzip' },
      cache: 'no-store'
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function idFromHref(href?: string): string {
  return (href || '').split('?')[0].replace(/\/$/, '').split('/').pop() || ''
}

// ---------------- Окно выборки (по Москве) ----------------
/** Дата, у которой UTC-поля равны московскому настенному времени. */
function mskWall(d: Date): Date {
  return new Date(d.getTime() + MSK_OFFSET_MS)
}
function fmtWall(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  )
}

/** Сутки [start, end) с границей WINDOW_HOUR:00 по Москве. Возвращает строки для фильтра. */
export function computeWindow(now: Date = new Date()): {
  startStr: string
  endStr: string
} {
  const wall = mskWall(now)
  const end = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), WINDOW_HOUR, 0, 0)
  )
  if (wall < end) end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 1)
  return { startStr: fmtWall(start), endStr: fmtWall(end) }
}

// ---------------- Ячейки склада ----------------
async function buildSlotMap(
  storeId: string,
  cache: Map<string, Map<string, string>>
): Promise<Map<string, string>> {
  const cached = cache.get(storeId)
  if (cached) return cached

  const zones = new Map<string, string>()
  const zoneData = await msGet(`/entity/store/${storeId}/zones?limit=1000`)
  for (const z of zoneData.rows || []) zones.set(z.id, z.name || '')

  const map = new Map<string, string>()
  const slotData = await msGet(`/entity/store/${storeId}/slots?limit=1000`)
  for (const sl of slotData.rows || []) {
    const zoneId = sl.zone ? idFromHref(sl.zone?.meta?.href) : ''
    const zoneName = zones.get(zoneId) || ''
    const slotName = sl.name || ''
    map.set(sl.id, zoneName ? `${zoneName} / ${slotName}` : slotName)
  }
  cache.set(storeId, map)
  return map
}

async function extractCell(
  demand: any,
  position: any,
  cache: Map<string, Map<string, string>>
): Promise<string> {
  const slotId = position.slot ? idFromHref(position.slot?.meta?.href) : ''
  if (!slotId) return ''
  const storeId = idFromHref(demand.store?.meta?.href)
  if (!storeId) return position.slot?.name || ''
  const map = await buildSlotMap(storeId, cache)
  return map.get(slotId) || ''
}

// ---------------- Штрихкоды / артикул / этикетка ----------------
function extractBarcodes4(assortment: any): string[] {
  const result: string[] = []
  for (const bc of assortment.barcodes || []) {
    if (!bc || typeof bc !== 'object') continue
    for (const value of Object.values(bc)) {
      if (typeof value === 'string' && value.startsWith('4') && !result.includes(value)) {
        result.push(value)
      }
    }
  }
  return result
}

function extractEtiketka(order: any): string {
  for (const attr of order?.attributes || []) {
    if ((attr.name || '').trim().toLowerCase() === ETIKETKA_ATTR.toLowerCase()) {
      const v = attr.value
      if (v && typeof v === 'object') return v.name || v.href || ''
      return v != null ? String(v) : ''
    }
  }
  return ''
}

// ---------------- Фото товара ----------------
async function downloadImage(
  assortment: any,
  cache: Map<string, Buffer | null>
): Promise<Buffer | null> {
  const pid = assortment.id
  if (!pid) return null
  if (cache.has(pid)) return cache.get(pid) || null

  let buf: Buffer | null = null
  const href = assortment.images?.meta?.href
  const size = assortment.images?.meta?.size
  if (href && (size === undefined || size > 0)) {
    try {
      const data = await msGet(`${href}?limit=1`)
      const first = data.rows?.[0]
      const dl = first?.miniature?.downloadHref || first?.meta?.downloadHref
      if (dl) buf = await msGetBuffer(dl)
    } catch {
      buf = null
    }
  }
  cache.set(pid, buf)
  return buf
}

// ---------------- Загрузка отгрузок ----------------
async function fetchDemands(startStr: string, endStr: string): Promise<any[]> {
  const filter = encodeURIComponent(`moment>=${startStr};moment<${endStr}`)
  const expand = 'organization,positions.assortment,customerOrder'
  const demands: any[] = []
  let offset = 0
  for (;;) {
    const data = await msGet(
      `/entity/demand?limit=100&offset=${offset}&order=moment,desc&expand=${expand}&filter=${filter}`
    )
    const rows = data.rows || []
    demands.push(...rows)
    const size = data.meta?.size ?? 0
    if (rows.length === 0 || offset + rows.length >= size) break
    offset += data.meta?.limit ?? 100
  }
  return demands
}

async function getPositions(demand: any): Promise<any[]> {
  const posObj = demand.positions || {}
  const rows: any[] = [...(posObj.rows || [])]
  const size = posObj.meta?.size ?? rows.length
  let offset = rows.length
  while (rows.length < size) {
    const data = await msGet(
      `/entity/demand/${demand.id}/positions?expand=assortment&limit=100&offset=${offset}`
    )
    const chunk = data.rows || []
    if (chunk.length === 0) break
    rows.push(...chunk)
    offset += chunk.length
  }
  return rows
}

function cellSortKey(cell: string): [number, number] {
  const m = String(cell || '').match(/(\d+)\s*$/)
  return m ? [0, Number(m[1])] : [1, 0]
}

// ---------------- Главная точка входа ----------------
export async function buildReport(
  startStr?: string,
  endStr?: string,
  downloadImages = true
): Promise<ReportResult> {
  if (!startStr || !endStr) {
    const w = computeWindow()
    startStr = w.startStr
    endStr = w.endStr
  }

  const demands = await fetchDemands(startStr, endStr)
  const slotCache = new Map<string, Map<string, string>>()
  const imgCache = new Map<string, Buffer | null>()
  const records: Record[] = []
  let totalPositions = 0
  let revenueKopecks = 0

  for (const demand of demands) {
    revenueKopecks += Number(demand.sum) || 0
    const order = demand.customerOrder || {}
    const number = demand.name || ''
    const org = demand.organization?.name || ''
    const etiketka = extractEtiketka(order)
    const orderDate = order.moment || demand.moment || ''

    const positions = await getPositions(demand)
    totalPositions += positions.length

    if (positions.length === 0) {
      records.push({
        Ячейка: '', Товар: '(позиции отсутствуют)', Артикул: '', Штрихкод: '',
        'Кол-во': '', Клиент: org, '№ заказа': number,
        'Ссылка на этикетку': etiketka, 'Дата заказа': orderDate, image: null
      })
      continue
    }

    for (const pos of positions) {
      const a = pos.assortment || {}
      const image = downloadImages ? await downloadImage(a, imgCache) : null
      records.push({
        Ячейка: await extractCell(demand, pos, slotCache),
        Товар: a.name || '',
        Артикул: a.article || '',
        Штрихкод: extractBarcodes4(a).join('\n'),
        'Кол-во': pos.quantity ?? 0,
        Клиент: org,
        '№ заказа': number,
        'Ссылка на этикетку': etiketka,
        'Дата заказа': orderDate,
        image
      })
    }
  }

  records.sort((x, y) => {
    const kx = cellSortKey(x.Ячейка)
    const ky = cellSortKey(y.Ячейка)
    if (kx[0] !== ky[0]) return kx[0] - ky[0]
    if (kx[1] !== ky[1]) return kx[1] - ky[1]
    return String(x.Товар).localeCompare(String(y.Товар))
  })

  return {
    startStr,
    endStr,
    records,
    stats: {
      demands: demands.length,
      positions: totalPositions,
      rows: records.length,
      revenue: Math.round(revenueKopecks / 100)
    }
  }
}
