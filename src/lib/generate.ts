import { buildReport, computeWindow } from './moysklad'
import { buildXlsx } from './xlsx'
import { uploadXlsx, insertSheet, type SheetDataRow } from './supabase'
import { fetchStickerNumber } from './sticker'

const LABEL_HOST = 'https://app.mpsklad.ru/'

/** "2026-07-28 13:00:00" -> "2026-07-28_13-00" (для имени файла/пути). */
function slug(s: string): string {
  return s.replace(' ', '_').slice(0, 16).replace(/:/g, '-')
}
/** Наивное московское время -> ISO с явным смещением +03:00 (для timestamptz). */
function toIso(s: string): string {
  return s.replace(' ', 'T') + '+03:00'
}
/** Буфер миниатюры -> data-URI (png/jpeg по сигнатуре). Крупные пропускаем. */
function toDataUri(buf: Buffer): string {
  if (buf.length > 300_000) return ''
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50
  return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`
}

export interface GenerateSummary {
  window: { start: string; end: string }
  filename: string
  storage_path: string
  stats: { demands: number; positions: number; rows: number }
}

/** Собирает отчёт за окно (по умолчанию текущее) и складывает в Supabase. */
export async function generateAndStore(
  startStr?: string,
  endStr?: string,
  downloadImages = true,
  source: 'auto' | 'manual' = 'auto'
): Promise<GenerateSummary> {
  if (!startStr || !endStr) {
    const w = computeWindow()
    startStr = w.startStr
    endStr = w.endStr
  }

  const report = await buildReport(startStr, endStr, downloadImages)

  // Номер WB-стикера из PDF-этикетки (одна этикетка на заказ — тянем по разу),
  // вешаем на записи ДО сборки XLSX, чтобы он попал и в файл, и в данные UI.
  const labelUrls = Array.from(
    new Set(
      report.records
        .map((r) => String(r['Ссылка на этикетку'] || '').trim())
        .filter((u) => u.startsWith(LABEL_HOST))
    )
  )
  const stickers = new Map<string, string>()
  for (const u of labelUrls) stickers.set(u, await fetchStickerNumber(u))
  for (const rec of report.records) {
    rec['Стикер'] = stickers.get(String(rec['Ссылка на этикетку'] || '').trim()) || ''
  }

  const xlsx = await buildXlsx(report.records)

  const filename = `assembly_sheet_${slug(startStr)}__${slug(endStr)}.xlsx`
  const storage_path = `sheets/${filename}`

  // Текстовые строки + миниатюра как data-URI (если есть) — для таблицы в UI.
  const data: SheetDataRow[] = report.records.map(({ image, ...rest }) => ({
    ...rest,
    _img: image ? toDataUri(image) : ''
  }))

  await uploadXlsx(storage_path, xlsx)
  await insertSheet({
    window_start: toIso(startStr),
    window_end: toIso(endStr),
    filename,
    storage_path,
    demands: report.stats.demands,
    positions: report.stats.positions,
    rows: report.stats.rows,
    revenue: report.stats.revenue,
    data,
    source
  })

  return {
    window: { start: startStr, end: endStr },
    filename,
    storage_path,
    stats: report.stats
  }
}
