import { NextResponse } from 'next/server'
import { listSheets, signedUrl, supabaseConfigured } from '@/lib/supabase'
import { computeWindow } from '@/lib/moysklad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Список готовых листов + подписанные ссылки на скачивание + текущее окно. */
export async function GET() {
  const window = computeWindow()
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false, window, sheets: [] })
  }
  try {
    const rows = await listSheets()
    const sheets = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        url: await signedUrl(r.storage_path).catch(() => null)
      }))
    )
    return NextResponse.json({ configured: true, window, sheets })
  } catch (e: any) {
    return NextResponse.json(
      { configured: true, window, sheets: [], error: String(e?.message || e) },
      { status: 502 }
    )
  }
}
