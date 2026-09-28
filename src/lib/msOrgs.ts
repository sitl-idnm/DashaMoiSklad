/**
 * Список организаций МойСклада (собственные юрлица) — для привязки клиента к
 * организации в админке. Только чтение, общий аккаунт из env. Серверный код.
 */
import 'server-only'

const BASE = 'https://api.moysklad.ru/api/remap/1.2'

function authHeader(): string {
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD
  if (!login || !password) throw new Error('MOYSKLAD_LOGIN / MOYSKLAD_PASSWORD не заданы')
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

export interface MsOrg {
  id: string
  name: string
  inn: string | null
}

export async function listMoyskladOrganizations(): Promise<MsOrg[]> {
  const res = await fetch(`${BASE}/entity/organization?limit=100`, {
    headers: { Authorization: authHeader(), 'Accept-Encoding': 'gzip' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`МойСклад ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.rows || []).map((o: any) => ({
    id: o.id,
    name: o.name || '',
    inn: o.inn || null
  }))
}
