/**
 * Авто-перевод заказов МойСклад в статус «Отгружен».
 * Правило: окно 11:00→11:00 (как лист сборки, с выходными), контрагент
 * ООО «Вайлдберриз», статус «Новый»/«На сборке» → «Отгружен».
 * Отменённые и прочие статусы не трогаем. Старые статусы пишем в лог для отката.
 * ЗАПИСЬ в МойСклад. Только серверный код.
 */
import 'server-only'
import { computeWindow, isWbAgent } from './moysklad'
import { saveFile } from './storage'

const BASE = 'https://api.moysklad.ru/api/remap/1.2'
const SOURCE_STATES = new Set(['новый', 'на сборке'])
const TARGET_STATE = 'отгружен'

function authHeader(): string {
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD
  if (!login || !password) throw new Error('MOYSKLAD_LOGIN / MOYSKLAD_PASSWORD не заданы')
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

async function ms(method: string, path: string, body?: any): Promise<any> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        'Accept-Encoding': 'gzip',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('X-Lognex-Retry-After') || 1500)))
      continue
    }
    if (!res.ok) {
      if (attempt < 3 && method === 'GET') { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); continue }
      throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    return res.json()
  }
}

/** Ссылка meta целевого статуса «Отгружен». */
async function targetStateMeta(): Promise<{ href: string }> {
  const meta = await ms('GET', '/entity/customerorder/metadata')
  const target = (meta.states || []).find((s: any) => (s.name || '').toLowerCase() === TARGET_STATE)
  if (!target?.meta?.href) throw new Error('Статус «Отгружен» не найден в метаданных')
  return { href: target.meta.href }
}

async function fetchWindowOrders(startStr: string, endStr: string): Promise<any[]> {
  const filter = encodeURIComponent(`moment>=${startStr};moment<${endStr}`)
  const rows: any[] = []
  let offset = 0
  for (;;) {
    const d = await ms(
      'GET',
      `/entity/customerorder?limit=100&offset=${offset}&order=moment,desc&expand=state,agent&filter=${filter}`
    )
    const chunk = d.rows || []
    rows.push(...chunk)
    const size = d.meta?.size ?? 0
    if (chunk.length === 0 || offset + chunk.length >= size) break
    offset += d.meta?.limit ?? 100
  }
  return rows
}

export interface ShipItem {
  id: string
  name: string
  fromState: string
  agent: string
}
export interface ShipResult {
  dry: boolean
  window: { start: string; end: string }
  total: number
  candidates: number
  moved: number
  skippedNonWb: number
  byStatus: Record<string, number>
  errors: { name: string; error: string }[]
  items: ShipItem[]
}

/**
 * Перевести подходящие заказы в «Отгружен».
 * @param dry true — ничего не пишем, только считаем кандидатов.
 */
export async function shipOrders(opts: { dry?: boolean } = {}): Promise<ShipResult> {
  const dry = !!opts.dry
  const { startStr, endStr } = computeWindow()
  const orders = await fetchWindowOrders(startStr, endStr)

  const byStatus: Record<string, number> = {}
  const candidates: any[] = []
  let skippedNonWb = 0
  for (const o of orders) {
    const st = (o.state?.name || '(нет статуса)')
    byStatus[st] = (byStatus[st] || 0) + 1
    if (!SOURCE_STATES.has(st.toLowerCase())) continue // берём только Новый/На сборке
    if (!isWbAgent(o)) { skippedNonWb++; continue } // контрагент должен быть ВБ
    candidates.push(o)
  }

  const items: ShipItem[] = candidates.map((o) => ({
    id: o.id, name: o.name, fromState: o.state?.name || '', agent: o.agent?.name || ''
  }))

  const result: ShipResult = {
    dry, window: { start: startStr, end: endStr },
    total: orders.length, candidates: candidates.length, moved: 0,
    skippedNonWb, byStatus, errors: [], items
  }
  if (dry || candidates.length === 0) return result

  // Лог для отката (до записи).
  try {
    const stamp = startStr.slice(0, 10)
    await saveFile(`ship-log/${stamp}.json`, Buffer.from(JSON.stringify({ window: result.window, items }, null, 2)))
  } catch { /* лог не критичен */ }

  const target = await targetStateMeta()
  for (const o of candidates) {
    try {
      await ms('PUT', `/entity/customerorder/${o.id}`, {
        state: { meta: { href: target.href, type: 'state', mediaType: 'application/json' } }
      })
      result.moved++
    } catch (e: any) {
      result.errors.push({ name: o.name, error: String(e?.message || e) })
    }
  }
  return result
}
