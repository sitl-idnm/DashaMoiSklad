/**
 * WB Statistics API — остатки (FBW/склады ВБ). Жёсткий лимит (~1 req/min),
 * поэтому дёргаем редко. Только серверный код.
 */
import 'server-only'
import { wbFetch } from './client'

export interface WbStock {
  lastChangeDate?: string
  warehouseName?: string
  barcode?: string
  quantity?: number
  quantityFull?: number
  nmId?: number
  supplierArticle?: string
  techSize?: string
}

/** Остатки, изменённые с dateFrom (ISO или YYYY-MM-DD). */
export async function fetchStocks(token: string, dateFrom = '2020-01-01'): Promise<WbStock[]> {
  const res = await wbFetch<WbStock[]>({
    scope: 'statistics',
    token,
    path: '/api/v1/supplier/stocks',
    query: { dateFrom },
    timeoutMs: 60000
  })
  return Array.isArray(res) ? res : []
}
