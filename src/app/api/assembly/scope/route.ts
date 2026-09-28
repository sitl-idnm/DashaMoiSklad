import { NextResponse } from 'next/server'
import { listClients } from '@/lib/clients'
import { listGroups } from '@/lib/groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Доступно операторам (не только админам): выбор клиента/группы для листа.
export async function GET() {
  try {
    const [clients, groups] = await Promise.all([listClients(), listGroups()])
    return NextResponse.json({
      ok: true,
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      groups: groups.map((g) => ({ id: g.id, name: g.name, size: g.members.length }))
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
