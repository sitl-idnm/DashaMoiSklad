import { NextResponse } from 'next/server'
import { listMoyskladOrganizations } from '@/lib/msOrgs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Список организаций МойСклада для привязки клиента (moysklad_org_id). */
export async function GET() {
  try {
    const organizations = await listMoyskladOrganizations()
    return NextResponse.json({ ok: true, organizations })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 })
  }
}
