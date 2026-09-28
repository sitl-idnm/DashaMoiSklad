import { NextResponse } from 'next/server'
import { reconcileProducts } from '@/lib/sync/reconcile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** GET /api/admin/clients/:id/diff?entity=products — сверка dry-run (без записи). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const entity = new URL(req.url).searchParams.get('entity') || 'products'
  try {
    if (entity !== 'products') {
      return NextResponse.json(
        { ok: false, error: 'Пока поддерживается только сверка товаров' },
        { status: 400 }
      )
    }
    const diff = await reconcileProducts(params.id)
    return NextResponse.json({ ok: true, diff })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
