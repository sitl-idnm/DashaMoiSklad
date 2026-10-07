import { getLatestAutoSheet, getSheetById, type SheetRow, type SheetDataRow } from '@/lib/sheets'
import { readFile } from '@/lib/storage'
import { dbConfigured } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Лист сборки по токену (для агента на локации: печать + сохранение на NAS).
 *   ?secret=CRON_SECRET (или Bearer) — доступ (страница публичная в middleware).
 *   ?id=N        — конкретный лист; без него — последний автособранный.
 *   ?format=xlsx — отдать исходный XLSX-файл; иначе печатный HTML под A4.
 * 204 — листа нет (напр. воскресенье пропущено) → агент ничего не делает.
 */
function authorized(req: Request, url: URL): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  if (req.headers.get('authorization') === `Bearer ${expected}`) return true
  return url.searchParams.get('secret') === expected
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const COLS = ['Ячейка', 'Товар', 'Артикул', 'Размер', 'Штрихкод', 'Кол-во', 'Клиент', '№ заказа', 'Стикер'] as const

function fmtWin(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!authorized(req, url)) return new Response('unauthorized', { status: 401 })
  if (!dbConfigured()) return new Response('db not configured', { status: 400 })

  const idParam = url.searchParams.get('id')
  const format = url.searchParams.get('format')
  const sheet: SheetRow | null = idParam ? await getSheetById(Number(idParam)) : await getLatestAutoSheet()
  if (!sheet) return new Response('', { status: 204 })

  // Исходный XLSX-файл.
  if (format === 'xlsx') {
    const buf = await readFile(sheet.storage_path)
    if (!buf) return new Response('file not found', { status: 404 })
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(sheet.filename)}"`,
        'Cache-Control': 'no-store'
      }
    })
  }

  // Печатный HTML под A4 (альбомная).
  const rows: SheetDataRow[] = (sheet as any).data || []
  if (rows.length === 0) return new Response('', { status: 204 })

  const title = `Лист сборки · ${fmtWin(sheet.window_start)} → ${fmtWin(sheet.window_end)}`
  const body = rows
    .map((r, i) => {
      const img = r._img ? `<img src="${esc(r._img)}" alt="">` : '<span class="no">—</span>'
      const cells = COLS.map((c) => `<td class="${c === 'Товар' ? 'name' : ''}">${esc(r[c])}</td>`).join('')
      return `<tr><td class="n">${i + 1}</td><td class="img">${img}</td>${cells}</tr>`
    })
    .join('')

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 13pt; margin: 0 0 6px; }
  .meta { font-size: 9pt; color: #333; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 2px 4px; font-size: 8pt; vertical-align: middle; }
  th { background: #eee; text-align: left; }
  td.n { text-align: right; color: #666; width: 22px; }
  td.img { width: 42px; padding: 1px; }
  td.img img { width: 40px; height: 40px; object-fit: cover; display: block; }
  td.name { max-width: 240px; }
  td .no { color: #bbb; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <div class="meta">Строк: ${rows.length} · отгрузок: ${sheet.demands} · позиций: ${sheet.positions}</div>
  <table>
    <thead><tr><th>#</th><th>Фото</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
}
