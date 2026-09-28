import { NextResponse } from 'next/server'
import { listGroups, createGroup } from '@/lib/groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ ok: true, groups: await listGroups() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Укажите название группы' }, { status: 400 })
    }
    const group = await createGroup(name)
    return NextResponse.json({ ok: true, group })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
