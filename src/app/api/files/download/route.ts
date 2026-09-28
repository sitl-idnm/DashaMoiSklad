import { NextResponse } from 'next/server'
import { readFile } from '@/lib/storage'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Доступ ограничен session-аутентификацией в middleware.ts.
export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get('path') || ''
  if (!rel) {
    return NextResponse.json({ error: 'path обязателен' }, { status: 400 })
  }
  try {
    const buf = await readFile(rel)
    if (!buf) return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
    const name = path.basename(rel)
    const isXlsx = name.toLowerCase().endsWith('.xlsx')
    return new NextResponse(buf as any, {
      headers: {
        'Content-Type': isXlsx
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 })
  }
}
