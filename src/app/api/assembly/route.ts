import { NextResponse } from 'next/server'
import { buildAssembly } from '@/lib/assembly'
import { groupClientIds } from '@/lib/groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** GET /api/assembly?clientId=..|groupId=..&from=&to= — строки листа сборки. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const clientId = sp.get('clientId')
  const groupId = sp.get('groupId')
  const from = sp.get('from') || undefined
  const to = sp.get('to') || undefined
  try {
    let clientIds: string[] = []
    if (groupId) clientIds = await groupClientIds(groupId)
    else if (clientId) clientIds = [clientId]
    else return NextResponse.json({ ok: false, error: 'Укажите clientId или groupId' }, { status: 400 })

    const rows = await buildAssembly(clientIds, { from, to })
    return NextResponse.json({ ok: true, rows, count: rows.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
