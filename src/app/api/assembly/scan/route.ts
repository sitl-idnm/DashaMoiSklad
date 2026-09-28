import { NextResponse } from 'next/server'
import { scanKiz } from '@/lib/scan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/assembly/scan  body: { clientId, orderId, code, bind? } */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const clientId = String(body?.clientId || '')
    const orderId = Number(body?.orderId)
    const code = String(body?.code || '').trim()
    const bind = body?.bind !== false
    if (!clientId || !Number.isFinite(orderId)) {
      return NextResponse.json({ ok: false, error: 'clientId и orderId обязательны' }, { status: 400 })
    }
    const result = await scanKiz(clientId, orderId, code, bind)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
