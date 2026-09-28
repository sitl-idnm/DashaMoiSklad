/**
 * Фото товара из кабинета ВБ (по синхронизированным карточкам коннектора).
 * В МойСкладе фото обычно нет, поэтому тянем URL с CDN ВБ: штрихкод строки →
 * product_variants.barcode → products.photos[0]. Требует разовой синхронизации
 * «Товары» у клиента; нет совпадения → пусто (сработает фолбэк на фото МойСклада).
 * Только серверный код.
 */
import 'server-only'
import { query } from './db'

/** Организация МойСклада → id клиента (привязанные, не архивные). */
export async function orgClientMap(): Promise<Map<string, string>> {
  const rows = await query<{ moysklad_org_id: string; id: string }>(
    `select moysklad_org_id, id from clients
      where archived = false and moysklad_org_id is not null`
  )
  const map = new Map<string, string>()
  for (const r of rows) map.set(r.moysklad_org_id, r.id)
  return map
}

/** Первый пригодный URL из WB photos (формат объекта или строки). */
function firstPhotoUrl(photos: any): string {
  if (!Array.isArray(photos) || photos.length === 0) return ''
  const p = photos[0]
  if (typeof p === 'string') return p
  if (p && typeof p === 'object') {
    return p.big || p.c516x688 || p.c246x328 || p.square || p.tm || p.hq || ''
  }
  return ''
}

/**
 * Фото по штрихкодам в рамках одного клиента: barcode → URL фото ВБ.
 * @param barcodes уникальные штрихкоды строк листа этого клиента
 */
export async function photoUrlsByBarcode(
  clientId: string,
  barcodes: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = Array.from(new Set(barcodes.filter(Boolean)))
  if (uniq.length === 0) return out
  const rows = await query<{ barcode: string; photos: any }>(
    `select pv.barcode, p.photos
       from product_variants pv
       join products p on p.id = pv.product_id
      where p.client_id = $1 and pv.barcode = any($2::text[])`,
    [clientId, uniq]
  )
  for (const r of rows) {
    const url = firstPhotoUrl(r.photos)
    if (url) out.set(r.barcode, url)
  }
  return out
}
