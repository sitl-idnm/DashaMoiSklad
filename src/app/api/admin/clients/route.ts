import { NextResponse } from 'next/server'
import { listClients, createClient } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Доступ к /api/admin/* уже ограничен ролью admin в middleware.ts.

export async function GET() {
  try {
    return NextResponse.json({ ok: true, clients: await listClients() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Укажите название клиента' }, { status: 400 })
    }
    const client = await createClient({
      name,
      inn: body?.inn ? String(body.inn).trim() : null,
      moysklad_org_id: body?.moysklad_org_id ? String(body.moysklad_org_id).trim() : null
    })
    return NextResponse.json({ ok: true, client })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
