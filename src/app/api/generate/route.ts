import { NextResponse } from 'next/server'
import { generateAndStore } from '@/lib/generate'
import { computeWindow } from '@/lib/moysklad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // секунд (для генерации с картинками)

/** Vercel Cron присылает `Authorization: Bearer $CRON_SECRET`. */
function authorized(req: Request, url: URL): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true // не задан = открыто (dev)
  const header = req.headers.get('authorization')
  if (header === `Bearer ${expected}`) return true
  return url.searchParams.get('secret') === expected
}

// Cron (GET) — генерит отчёт за текущее окно и кладёт в Supabase.
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!authorized(req, url)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const summary = await generateAndStore()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e: any) {
    console.error('[generate] failed', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 })
  }
}

// Ручной запуск из панели (POST). Можно передать { start, end, downloadImages }.
export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  try {
    const summary = await generateAndStore(
      body.start,
      body.end,
      body.downloadImages !== false
    )
    return NextResponse.json({ ok: true, ...summary })
  } catch (e: any) {
    console.error('[generate] failed', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 })
  }
}

// Текущее окно выборки — для отображения в панели.
export async function HEAD() {
  const { startStr, endStr } = computeWindow()
  return new NextResponse(null, {
    headers: { 'X-Window-Start': startStr, 'X-Window-End': endStr }
  })
}
