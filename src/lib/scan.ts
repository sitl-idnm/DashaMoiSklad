/**
 * WMS-скан: привязка КИЗ (DataMatrix) к сборочному заданию ВБ + получение
 * стикера для печати. Пишет ТОЛЬКО в ВБ и в нашу БД — НЕ в МойСклад.
 * Только серверный код.
 */
import 'server-only'
import { query, queryOne } from './db'
import { getDecryptedToken } from './clients'
import { bindSgtin, fetchStickers } from './wb/marketplace'

export interface ScanResult {
  ok: boolean
  orderId: number
  sticker?: { file?: string; partA?: number; partB?: number; barcode?: string }
  error?: string
}

/**
 * Обработать скан КИЗ по заданию.
 * @param bind — привязывать ли код к ВБ (мутация кабинета). false = только стикер.
 */
export async function scanKiz(
  clientId: string,
  orderId: number,
  code: string,
  bind = true
): Promise<ScanResult> {
  const order = await queryOne<{ id: string; kiz: any }>(
    `select id, kiz from orders where client_id=$1 and wb_order_id=$2`,
    [clientId, orderId]
  )
  if (!order) return { ok: false, orderId, error: 'Задание не найдено в базе' }

  const token = await getDecryptedToken(clientId, 'marketplace')
  if (!token) return { ok: false, orderId, error: 'Нет WB-токена scope «marketplace»' }

  // 1) Привязка КИЗ к заданию (мутация ВБ).
  if (bind && code) {
    try {
      await bindSgtin(token, orderId, [code])
    } catch (e: any) {
      return { ok: false, orderId, error: `Привязка КИЗ к ВБ: ${String(e?.message || e)}` }
    }
  }

  // 2) Стикер для печати.
  let sticker: ScanResult['sticker']
  try {
    const list = await fetchStickers(token, [orderId])
    const s = list[0]
    if (s) sticker = { file: s.file, partA: s.partA, partB: s.partB, barcode: s.barcode }
  } catch {
    // Стикер не получили — вернём ok, но без файла (можно повторить печать).
  }

  // 3) Сохраняем КИЗ и стикер в нашей модели.
  const existing: string[] = Array.isArray(order.kiz) ? order.kiz : []
  const kiz = code && !existing.includes(code) ? [...existing, code] : existing
  await query(
    `update orders set kiz=$2::jsonb, sticker=coalesce($3::jsonb, sticker), status='scanned', updated_at=now()
      where id=$1`,
    [order.id, JSON.stringify(kiz), sticker ? JSON.stringify(sticker) : null]
  )

  return { ok: true, orderId, sticker }
}
