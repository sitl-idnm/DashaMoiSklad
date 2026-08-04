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

/** Параллельный map с ограничением конкурентности и общим бюджетом времени. */
async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<string>,
  budgetMs: number
): Promise<Map<T, string>> {
  const out = new Map<T, string>()
  const deadline = Date.now() + budgetMs
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < items.length && Date.now() < deadline) {
      const item = items[idx++]
      try {
        out.set(item, await fn(item))
      } catch {
        /* пропускаем — останется без стикера */
      }
    }
  }
  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
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

  // Бюджет генерации. Платформенный лимит функции Vercel — 60 c, поэтому держим
  // жёсткие внутренние отсечки и оставляем «хвост» на сборку XLSX и две загрузки
  // в Supabase (файл + JSON с превью). Что не успели обогатить — отдаём без части
  // фото/стикеров, но БЕЗ 504.
  const start = Date.now()
  const imageDeadline = start + 36_000 // фото перестаём тянуть на 36-й секунде
  const stickerDeadline = start + 44_000 // стикеры — до 44-й секунды (≥16 c на хвост)

  const report = await buildReport(startStr, endStr, downloadImages, imageDeadline)

  // Номер WB-стикера из PDF-этикетки (одна этикетка на заказ — тянем по разу),
  // вешаем на записи ДО сборки XLSX, чтобы он попал и в файл, и в данные UI.
  const labelUrls = Array.from(
    new Set(
      report.records
        .map((r) => String(r['Ссылка на этикетку'] || '').trim())
        .filter((u) => u.startsWith(LABEL_HOST))
    )
  )
  // Этикетки MPsklad генерятся ~4–5 c каждая — качаем параллельно с общим
  // бюджетом времени, чтобы не упереться в лимит функции Vercel. Не успевшие
  // за бюджет останутся без номера стикера (отчёт всё равно сформируется).
  const stickerBudget = stickerDeadline - Date.now()
  const stickers =
    stickerBudget > 500
      ? await mapPool(labelUrls, 12, fetchStickerNumber, stickerBudget)
      : new Map<string, string>()
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
