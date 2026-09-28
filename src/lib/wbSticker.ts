/**
 * Стикеры ВБ напрямую из кабинета клиента (замена парсинга PDF MPsklad).
 * Клиент↔организация МойСклада связаны через clients.moysklad_org_id.
 * Только серверный код. Любая ошибка/отсутствие ключа → пустой результат,
 * вызывающая сторона откатывается на старый способ (PDF-этикетка).
 */
import 'server-only'
import { query } from './db'
import { decryptSecret } from './wb/crypto'
import { fetchStickers } from './wb/marketplace'

/** marketplace-токены по организации МойСклада (moysklad_org_id → token). */
export async function marketplaceTokensByOrg(): Promise<Map<string, string>> {
  const rows = await query<{ moysklad_org_id: string; token_encrypted: string }>(
    `select c.moysklad_org_id, w.token_encrypted
       from clients c
       join wb_credentials w on w.client_id = c.id and w.scope = 'marketplace'
      where c.archived = false and c.moysklad_org_id is not null`
  )
  const map = new Map<string, string>()
  for (const r of rows) {
    try {
      map.set(r.moysklad_org_id, await decryptSecret(r.token_encrypted))
    } catch {
      /* битый шифртекст — пропускаем, сработает фолбэк */
    }
  }
  return map
}

/**
 * Тянет стикеры ВБ для заказов, сгруппированных по организации.
 * @param ordersByOrg orgId → множество WB order id (= order.name из МойСклада)
 * @param tokens      orgId → marketplace-токен
 * @returns Map(orderId → "partA partB"); заказы без токена/ошибки просто отсутствуют.
 */
export async function fetchWbStickers(
  ordersByOrg: Map<string, Set<number>>,
  tokens: Map<string, string>
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  for (const [orgId, orderIds] of ordersByOrg) {
    const token = tokens.get(orgId)
    if (!token || orderIds.size === 0) continue
    try {
      const stickers = await fetchStickers(token, Array.from(orderIds))
      for (const s of stickers) {
        if (s.partA != null && s.partB != null) {
          out.set(s.orderId, `${s.partA} ${s.partB}`)
        }
      }
    } catch {
      /* невалидный токен / ВБ недоступен — оставляем на фолбэк по PDF */
    }
  }
  return out
}
