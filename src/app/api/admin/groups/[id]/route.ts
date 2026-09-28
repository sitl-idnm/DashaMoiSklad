import { NextResponse } from 'next/server'
import { setGroupMembers, deleteGroup } from '@/lib/groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PUT /api/admin/groups/:id  body: { clientIds: string[] } — заменить состав. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const clientIds = Array.isArray(body?.clientIds) ? body.clientIds.map(String) : []
    await setGroupMembers(params.id, clientIds)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteGroup(params.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
