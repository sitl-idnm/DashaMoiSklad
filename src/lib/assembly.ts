/**
 * Лист сборки на НАШЕЙ модели (заказы ВБ), без МойСклад.
 * Собирает строки по одному клиенту или группе клиентов (объединённая отгрузка).
 * Только серверный код.
 */
import 'server-only'
import { query } from './db'

export interface AssemblyRow {
  order_id: number
  client_id: string
  client: string
  title: string
  vendor_code: string
  barcode: string
  qty: number
  sticker: string // "partA partB" если есть
  order_date: string
  photo: string // url миниатюры, если есть
  status: string
}

interface RawRow {
  wb_order_id: number
  client_id: string
  barcode: string | null
  nm_id: number | null
  status: string | null
  created_at_wb: string | null
  sticker: any
  client_name: string
  title: string | null
  vendor_code: string | null
  photos: any
}

/** Первый доступный url фото из WB photos[]. */
function photoUrl(photos: any): string {
  if (!Array.isArray(photos) || photos.length === 0) return ''
  const p = photos[0]
  if (typeof p === 'string') return p
  return p?.c246x328 || p?.big || p?.tm || p?.square || ''
}

function stickerText(sticker: any): string {
  if (!sticker || typeof sticker !== 'object') return ''
  const a = sticker.partA ?? ''
  const b = sticker.partB ?? ''
  return a || b ? `${a} ${b}`.trim() : sticker.barcode || ''
}

// Заказы с этими статусами в лист не попадают.
const EXCLUDED = ['cancel', 'declined', 'canceled']

/** Строки листа сборки для набора клиентов. Опционально — окно по дате заказа. */
export async function buildAssembly(
  clientIds: string[],
  opts: { from?: string; to?: string } = {}
): Promise<AssemblyRow[]> {
  if (clientIds.length === 0) return []

  const params: any[] = [clientIds]
  let dateCond = ''
  if (opts.from) {
    params.push(opts.from)
    dateCond += ` and o.created_at_wb >= $${params.length}`
  }
  if (opts.to) {
    params.push(opts.to)
    dateCond += ` and o.created_at_wb < $${params.length}`
  }

  const rows = await query<RawRow>(
    `select o.wb_order_id, o.client_id, o.barcode, o.nm_id, o.status, o.created_at_wb, o.sticker,
            cl.name as client_name,
            p.title, p.vendor_code, p.photos
       from orders o
       join clients cl on cl.id = o.client_id
       left join products p on p.client_id = o.client_id and p.wb_nm_id = o.nm_id
      where o.client_id = any($1::uuid[]) ${dateCond}
      order by cl.name, p.title nulls last, o.wb_order_id`,
    params
  )

  return rows
    .filter((r) => !EXCLUDED.includes((r.status || '').toLowerCase()))
    .map((r) => ({
      order_id: r.wb_order_id,
      client_id: r.client_id,
      client: r.client_name,
      title: r.title || '',
      vendor_code: r.vendor_code || '',
      barcode: r.barcode || '',
      qty: 1, // одно сборочное задание FBS = единица
      sticker: stickerText(r.sticker),
      order_date: r.created_at_wb || '',
      photo: photoUrl(r.photos),
      status: r.status || ''
    }))
}
