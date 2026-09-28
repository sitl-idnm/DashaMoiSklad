/**
 * Pull из ВБ в нашу доменную модель (products/orders/prices/stock).
 * Каждая функция — идемпотентный upsert; счётчик created/updated через xmax.
 * Записи в МойСклад здесь НЕТ. Только серверный код.
 */
import 'server-only'
import { query } from '../db'
import type { SyncStats } from './run'
import { fetchAllCards } from '../wb/content'
import { fetchNewOrders, fetchStickers, type WbSticker } from '../wb/marketplace'
import { fetchAllGoods } from '../wb/prices'
import { fetchStocks } from '../wb/statistics'

/** true, если строка была вставлена (а не обновлена) — по xmax=0. */
type UpsertMark = { id: string; inserted: boolean }

// ─────────────────── Товары / карточки ───────────────────
export async function pullProducts(clientId: string, token: string): Promise<SyncStats> {
  let created = 0
  let updated = 0
  let variants = 0

  await fetchAllCards(token, async (cards) => {
    for (const card of cards) {
      const rows = await query<UpsertMark>(
        `insert into products
           (client_id, wb_nm_id, vendor_code, title, brand, subject, characteristics, photos, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb, now())
         on conflict (client_id, wb_nm_id) do update set
           vendor_code=excluded.vendor_code, title=excluded.title, brand=excluded.brand,
           subject=excluded.subject, characteristics=excluded.characteristics,
           photos=excluded.photos, updated_at=now()
         returning id, (xmax = 0) as inserted`,
        [
          clientId,
          card.nmID,
          card.vendorCode ?? null,
          card.title ?? null,
          card.brand ?? null,
          card.subjectName ?? null,
          JSON.stringify(card.characteristics ?? null),
          JSON.stringify(card.photos ?? null)
        ]
      )
      const productId = rows[0].id
      if (rows[0].inserted) created++
      else updated++

      for (const size of card.sizes || []) {
        for (const barcode of size.skus || []) {
          if (!barcode) continue
          await query(
            `insert into product_variants (product_id, wb_chrt_id, tech_size, barcode, updated_at)
             values ($1,$2,$3,$4, now())
             on conflict (product_id, barcode) do update set
               wb_chrt_id=excluded.wb_chrt_id, tech_size=excluded.tech_size, updated_at=now()`,
            [productId, size.chrtID ?? null, size.techSize ?? null, barcode]
          )
          variants++
        }
      }
    }
  })

  return { created, updated, total: created + updated, skipped: variants }
}

// ─────────────────── Заказы FBS (+ стикеры) ───────────────────
export async function pullOrders(clientId: string, token: string): Promise<SyncStats> {
  const orders = await fetchNewOrders(token)
  let created = 0
  let updated = 0

  // Стикеры одним батчем по всем новым заданиям.
  let stickerBy = new Map<number, WbSticker>()
  if (orders.length) {
    try {
      const stickers = await fetchStickers(token, orders.map((o) => o.id))
      stickerBy = new Map(stickers.map((s) => [s.orderId, s]))
    } catch {
      // Стикеры не критичны для синка — заказ сохраним без них.
    }
  }

  for (const o of orders) {
    const sticker = stickerBy.get(o.id) || null
    const barcode = o.skus && o.skus.length ? o.skus[0] : null
    const rows = await query<UpsertMark>(
      `insert into orders
         (client_id, wb_order_id, wb_rid, supply_id, status, nm_id, barcode, price,
          address, created_at_wb, sticker, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb, now())
       on conflict (client_id, wb_order_id) do update set
         wb_rid=excluded.wb_rid, supply_id=excluded.supply_id, status=excluded.status,
         nm_id=excluded.nm_id, barcode=excluded.barcode, price=excluded.price,
         address=excluded.address, sticker=coalesce(excluded.sticker, orders.sticker),
         updated_at=now()
       returning id, (xmax = 0) as inserted`,
      [
        clientId,
        o.id,
        o.rid ?? null,
        o.supplyId ?? null,
        'new',
        o.nmId ?? null,
        barcode,
        o.price ?? null,
        JSON.stringify(o.address ?? null),
        o.createdAt ?? null,
        sticker ? JSON.stringify(sticker) : null
      ]
    )
    if (rows[0].inserted) created++
    else updated++
  }

  return { created, updated, total: orders.length }
}

// ─────────────────── Цены ───────────────────
export async function pullPrices(clientId: string, token: string): Promise<SyncStats> {
  let created = 0
  let updated = 0

  await fetchAllGoods(token, async (goods) => {
    for (const g of goods) {
      const size = g.sizes && g.sizes.length ? g.sizes[0] : undefined
      const price = size?.discountedPrice ?? size?.price ?? null
      const rows = await query<UpsertMark>(
        `insert into prices (client_id, nm_id, price, discount, updated_at)
         values ($1,$2,$3,$4, now())
         on conflict (client_id, nm_id) do update set
           price=excluded.price, discount=excluded.discount, updated_at=now()
         returning id, (xmax = 0) as inserted`,
        [clientId, g.nmID, price, g.discount ?? null]
      )
      if (rows[0].inserted) created++
      else updated++
    }
  })

  return { created, updated, total: created + updated }
}

// ─────────────────── Остатки ───────────────────
export async function pullStock(clientId: string, token: string): Promise<SyncStats> {
  const stocks = await fetchStocks(token)
  let created = 0
  let updated = 0

  for (const s of stocks) {
    if (!s.barcode) continue
    const rows = await query<UpsertMark>(
      `insert into stock (client_id, barcode, warehouse_id, qty, source, updated_at)
       values ($1,$2,$3,$4,'wb', now())
       on conflict (client_id, barcode, warehouse_id, source) do update set
         qty=excluded.qty, updated_at=now()
       returning id, (xmax = 0) as inserted`,
      [clientId, s.barcode, s.warehouseName ?? '', s.quantity ?? 0]
    )
    if (rows[0].inserted) created++
    else updated++
  }

  return { created, updated, total: stocks.length }
}
