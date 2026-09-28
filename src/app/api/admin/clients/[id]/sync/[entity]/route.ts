import { NextResponse } from 'next/server'
import { runPull, runPullAll } from '@/lib/sync'
import type { SyncEntity } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Синк может идти дольше дефолта — на self-host лимита нет.
export const maxDuration = 300

const ENTITIES: SyncEntity[] = ['products', 'orders', 'stock', 'prices']

/** POST /api/admin/clients/:id/sync/:entity  (entity ∈ products|orders|stock|prices|all) */
export async function POST(
  _req: Request,
  { params }: { params: { id: string; entity: string } }
) {
  try {
    if (params.entity === 'all') {
      const results = await runPullAll(params.id)
      return NextResponse.json({ ok: true, results })
    }
    if (!ENTITIES.includes(params.entity as SyncEntity)) {
      return NextResponse.json({ ok: false, error: 'Неверная сущность' }, { status: 400 })
    }
    const result = await runPull(params.id, params.entity as SyncEntity)
    return NextResponse.json({ ok: result.status === 'done', result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
