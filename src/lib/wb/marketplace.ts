/**
 * WB Marketplace API (FBS) — новые сборочные задания, стикеры, привязка КИЗ.
 * Только серверный код.
 */
import 'server-only'
import { wbFetch } from './client'

export interface WbOrder {
  id: number
  rid?: string
  createdAt?: string
  warehouseId?: number
  supplyId?: string
  nmId?: number
  chrtId?: number
  article?: string
  skus?: string[]
  price?: number // копейки
  convertedPrice?: number
  salePrice?: number
  address?: any
  ddate?: string
  offices?: string[]
}

export interface WbSticker {
  orderId: number
  partA?: number
  partB?: number
  barcode?: string
  file?: string // base64
}

/** Новые (ещё не в поставке) сборочные задания FBS. */
export async function fetchNewOrders(token: string): Promise<WbOrder[]> {
  const res = await wbFetch<{ orders?: WbOrder[] }>({
    scope: 'marketplace',
    token,
    path: '/api/v3/orders/new'
  })
  return res.orders || []
}

/**
 * Стикеры для заданий. type: png|svg|zplv|zplh, размеры в мм-пикселях WB.
 * За раз — до 100 заданий.
 */
export async function fetchStickers(
  token: string,
  orderIds: number[],
  type: 'png' | 'svg' | 'zplv' | 'zplh' = 'png',
  width = 58,
  height = 40
): Promise<WbSticker[]> {
  if (orderIds.length === 0) return []
  const out: WbSticker[] = []
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100)
    const res = await wbFetch<{ stickers?: WbSticker[] }>({
      scope: 'marketplace',
      token,
      method: 'POST',
      path: '/api/v3/orders/stickers',
      query: { type, width, height },
      body: { orders: chunk }
    })
    out.push(...(res.stickers || []))
  }
  return out
}

/**
 * Привязать коды маркировки (КИЗ / sgtin) к сборочному заданию.
 * ⚠️ Это мутация в кабинете ВБ (не МойСклад). Вызывается только из сканера.
 */
export async function bindSgtin(
  token: string,
  orderId: number,
  sgtins: string[]
): Promise<void> {
  await wbFetch({
    scope: 'marketplace',
    token,
    method: 'PUT',
    path: `/api/v3/orders/${orderId}/meta/sgtin`,
    body: { sgtins }
  })
}
