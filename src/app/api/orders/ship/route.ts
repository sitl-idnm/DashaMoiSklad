import { NextResponse } from 'next/server'
import { shipOrders } from '@/lib/ship'
import { isAutoSkipDay } from '@/lib/moysklad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Cron шлёт Authorization: Bearer $CRON_SECRET (как /api/generate). */
function authorized(req: Request, url: URL): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true // dev
  if (req.headers.get('authorization') === `Bearer ${expected}`) return true
  return url.searchParams.get('secret') === expected
}

/**
 * Авто-перевод заказов ВБ в «Отгружен» за суточное окно.
 * ?dry=1 — предпросмотр без записи. Воскресенье — пропуск (как лист).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!authorized(req, url)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const dry = url.searchParams.get('dry') === '1' || url.searchParams.get('dry') === 'true'
  if (!dry && isAutoSkipDay()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Воскресенье — перевод пропущен' })
  }
  try {
    const result = await shipOrders({ dry })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 })
  }
}
