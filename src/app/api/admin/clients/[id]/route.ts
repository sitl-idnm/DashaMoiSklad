import { NextResponse } from 'next/server'
import { getClient, updateClient, archiveClient, listCredentials } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const client = await getClient(params.id)
    if (!client) {
      return NextResponse.json({ ok: false, error: 'Клиент не найден' }, { status: 404 })
    }
    const credentials = await listCredentials(params.id)
    return NextResponse.json({ ok: true, client, credentials })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const patch: Record<string, any> = {}
    if (typeof body?.name === 'string') patch.name = body.name.trim()
    if ('inn' in body) patch.inn = body.inn ? String(body.inn).trim() : null
    if ('moysklad_org_id' in body)
      patch.moysklad_org_id = body.moysklad_org_id ? String(body.moysklad_org_id).trim() : null
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Нет полей для обновления' }, { status: 400 })
    }
    await updateClient(params.id, patch)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await archiveClient(params.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
