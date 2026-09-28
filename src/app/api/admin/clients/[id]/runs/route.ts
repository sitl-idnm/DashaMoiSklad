import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/sync/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ ok: true, runs: await listRuns(params.id) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
