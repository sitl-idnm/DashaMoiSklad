import { NextResponse } from 'next/server'
import { setWritesEnabled, type SyncEntity } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ENTITIES: SyncEntity[] = ['products', 'orders', 'stock', 'prices']

/** Body: { entity, enabled }. Включает/выключает запись в МойСклад по сущности. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const entity = body?.entity
    const enabled = Boolean(body?.enabled)
    if (!ENTITIES.includes(entity)) {
      return NextResponse.json({ ok: false, error: 'Неверная сущность' }, { status: 400 })
    }
    await setWritesEnabled(params.id, entity, enabled)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
