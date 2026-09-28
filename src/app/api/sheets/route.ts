import { NextResponse } from 'next/server'
import { listSheetsMeta } from '@/lib/sheets'
import { fileDownloadUrl } from '@/lib/storage'
import { dbConfigured } from '@/lib/db'
import { computeWindow } from '@/lib/moysklad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Список готовых листов (МЕТА, без тяжёлых строк) + ссылки на скачивание + окно.
 * Строки таблицы грузятся лениво по /api/sheets/[id] при раскрытии дня.
 */
export async function GET() {
  const window = computeWindow()
  if (!dbConfigured()) {
    return NextResponse.json({ configured: false, window, sheets: [] })
  }
  try {
    const rows = await listSheetsMeta()
    const sheets = rows.map((r) => ({ ...r, url: fileDownloadUrl(r.storage_path) }))
    return NextResponse.json({ configured: true, window, sheets })
  } catch (e: any) {
    return NextResponse.json(
      { configured: true, window, sheets: [], error: String(e?.message || e) },
      { status: 502 }
    )
  }
}
