/**
 * WB Prices & Discounts API — текущие цены/скидки по номенклатурам.
 * Offset-пагинация. Только серверный код.
 */
import 'server-only'
import { wbFetch } from './client'

export interface WbGood {
  nmID: number
  vendorCode?: string
  discount?: number
  sizes?: { price?: number; discountedPrice?: number; techSizeName?: string }[]
}

interface GoodsResponse {
  data?: { listGoods?: WbGood[] }
}

const LIMIT = 1000

/** Пройти все товары с ценами, вызывая onBatch для каждой страницы. */
export async function fetchAllGoods(
  token: string,
  onBatch: (goods: WbGood[]) => Promise<void>
): Promise<number> {
  let offset = 0
  let total = 0
  for (;;) {
    const res = await wbFetch<GoodsResponse>({
      scope: 'prices',
      token,
      path: '/api/v2/list/goods/filter',
      query: { limit: LIMIT, offset }
    })
    const goods = res.data?.listGoods || []
    if (goods.length === 0) break
    await onBatch(goods)
    total += goods.length
    if (goods.length < LIMIT) break
    offset += LIMIT
  }
  return total
}
