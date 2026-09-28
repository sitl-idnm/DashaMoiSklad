/**
 * WB Content API — карточки товаров. Cursor-пагинация.
 * Docs: POST /content/v2/get/cards/list. Только серверный код.
 */
import 'server-only'
import { wbFetch } from './client'

export interface WbSize {
  chrtID?: number
  techSize?: string
  wbSize?: string
  skus?: string[]
}
export interface WbCard {
  nmID: number
  imtID?: number
  vendorCode?: string
  subjectID?: number
  subjectName?: string
  brand?: string
  title?: string
  description?: string
  photos?: any[]
  sizes?: WbSize[]
  characteristics?: any[]
  dimensions?: any
}

interface CardsListResponse {
  cards?: WbCard[]
  cursor?: { updatedAt?: string; nmID?: number; total?: number }
}

const LIMIT = 100

/**
 * Пройти все карточки клиента, вызывая onBatch для каждой страницы.
 * Возвращает общее число обработанных карточек.
 */
export async function fetchAllCards(
  token: string,
  onBatch: (cards: WbCard[]) => Promise<void>
): Promise<number> {
  let cursor: { updatedAt?: string; nmID?: number } = {}
  let total = 0
  for (;;) {
    const body = {
      settings: {
        cursor: { limit: LIMIT, ...cursor },
        filter: { withPhoto: -1 }
      }
    }
    const res = await wbFetch<CardsListResponse>({
      scope: 'content',
      token,
      method: 'POST',
      path: '/content/v2/get/cards/list',
      body
    })
    const cards = res.cards || []
    if (cards.length === 0) break
    await onBatch(cards)
    total += cards.length

    const cur = res.cursor
    // Признак последней страницы: вернулось меньше лимита.
    if (!cur || cards.length < LIMIT) break
    cursor = { updatedAt: cur.updatedAt, nmID: cur.nmID }
  }
  return total
}
