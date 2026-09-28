import { NextResponse } from 'next/server'
import { getSheetData } from '@/lib/sheets'
import { dbConfigured } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Строки (с превью) одного листа — ленивая подгрузка при раскрытии дня. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: 'БД не настроена' }, { status: 400 })
  }
  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: 'Некорректный id' }, { status: 400 })
  }
  try {
    const data = await getSheetData(id)
    if (data === null) {
      return NextResponse.json({ ok: false, error: 'Лист не найден' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 })
  }
}
