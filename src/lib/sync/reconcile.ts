/**
 * Сверка (dry-run): наши товары из ВБ ↔ товары МойСклад.
 * Матч по баркоду → фолбэк по артикулу. Ничего не пишет.
 * Только серверный код.
 */
import 'server-only'
import { query } from '../db'
import { loadMoyskladIndex } from '../adapters/moysklad/read'

export type DiffAction = 'create' | 'update' | 'conflict'

export interface DiffItem {
  wb_nm_id: number
  vendor_code: string | null
  title: string | null
  barcodes: string[]
  action: DiffAction
  ms_name?: string // с чем сматчили в МойСклад
  reason?: string
}

export interface DiffResult {
  ms_count: number
  stats: { create: number; update: number; conflict: number; total: number }
  items: DiffItem[] // ограниченная выборка для UI
}

interface ProductRow {
  wb_nm_id: number
  vendor_code: string | null
  title: string | null
  barcodes: string[]
}

/**
 * Сверка товаров клиента. entity сейчас только 'products' (остальные — позже).
 * ITEM_LIMIT — сколько примеров вернуть в UI (счётчики считаем по всем).
 */
export async function reconcileProducts(clientId: string, itemLimit = 300): Promise<DiffResult> {
  const [ms, products] = await Promise.all([
    loadMoyskladIndex(),
    query<ProductRow>(
      `select p.wb_nm_id, p.vendor_code, p.title,
              coalesce(
                json_agg(v.barcode) filter (where v.barcode is not null),
                '[]'
              ) as barcodes
         from products p
         left join product_variants v on v.product_id = p.id
        where p.client_id = $1
        group by p.id`,
      [clientId]
    )
  ])

  const stats = { create: 0, update: 0, conflict: 0, total: products.length }
  const items: DiffItem[] = []

  for (const p of products) {
    const barcodes = Array.isArray(p.barcodes) ? p.barcodes : []
    let action: DiffAction = 'create'
    let ms_name: string | undefined
    let reason: string | undefined

    // 1) Матч по баркоду — самый надёжный.
    const bcMatch = barcodes.map((b) => ms.byBarcode.get(b)).find(Boolean)
    if (bcMatch) {
      action = 'update'
      ms_name = bcMatch.name
    } else if (p.vendor_code && ms.byArticle.has(p.vendor_code)) {
      // 2) Артикул совпал, а баркод — нет: потенциальный конфликт данных.
      action = 'conflict'
      ms_name = ms.byArticle.get(p.vendor_code)!.name
      reason = 'Артикул совпал, баркод — нет'
    } else {
      action = 'create'
    }

    stats[action]++
    if (items.length < itemLimit) {
      items.push({
        wb_nm_id: p.wb_nm_id,
        vendor_code: p.vendor_code,
        title: p.title,
        barcodes,
        action,
        ms_name,
        reason
      })
    }
  }

  return { ms_count: ms.count, stats, items }
}
