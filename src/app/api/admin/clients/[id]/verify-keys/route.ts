import { NextResponse } from 'next/server'
import { verifyKeys } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const credentials = await verifyKeys(params.id)
    return NextResponse.json({ ok: true, credentials })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
