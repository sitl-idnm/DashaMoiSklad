import { NextResponse } from 'next/server'
import {
  listCredentials,
  setWbCredential,
  setWbCredentialAll,
  deleteWbCredential,
  WB_SCOPES
} from '@/lib/clients'
import type { WbScope } from '@/lib/wb/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isScope(s: any): s is WbScope {
  return WB_SCOPES.includes(s)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ ok: true, credentials: await listCredentials(params.id) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

/** Сохранить/заменить токен. Body: { scope, token }. scope='all' — один ключ на все категории. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const scope = body?.scope
    const token = String(body?.token || '').trim()
    if (scope !== 'all' && !isScope(scope)) {
      return NextResponse.json({ ok: false, error: 'Неверный scope' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Пустой токен' }, { status: 400 })
    }
    if (scope === 'all') await setWbCredentialAll(params.id, token)
    else await setWbCredential(params.id, scope, token)
    return NextResponse.json({ ok: true, credentials: await listCredentials(params.id) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

/** Удалить токен по scope. Query: ?scope=... */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const scope = new URL(req.url).searchParams.get('scope')
    if (!isScope(scope)) {
      return NextResponse.json({ ok: false, error: 'Неверный scope' }, { status: 400 })
    }
    await deleteWbCredential(params.id, scope)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
