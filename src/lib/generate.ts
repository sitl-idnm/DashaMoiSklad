import { buildReport, computeWindow } from './moysklad'
import { buildXlsx } from './xlsx'
import { uploadXlsx, insertSheet } from './supabase'

/** "2026-07-28 13:00:00" -> "2026-07-28_13-00" (для имени файла/пути). */
function slug(s: string): string {
  return s.replace(' ', '_').slice(0, 16).replace(/:/g, '-')
}
/** Наивное московское время -> ISO с явным смещением +03:00 (для timestamptz). */
function toIso(s: string): string {
  return s.replace(' ', 'T') + '+03:00'
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
  downloadImages = true
): Promise<GenerateSummary> {
  if (!startStr || !endStr) {
    const w = computeWindow()
    startStr = w.startStr
    endStr = w.endStr
  }

  const report = await buildReport(startStr, endStr, downloadImages)
  const xlsx = await buildXlsx(report.records)

  const filename = `assembly_sheet_${slug(startStr)}__${slug(endStr)}.xlsx`
  const storage_path = `sheets/${filename}`

  await uploadXlsx(storage_path, xlsx)
  await insertSheet({
    window_start: toIso(startStr),
    window_end: toIso(endStr),
    filename,
    storage_path,
    demands: report.stats.demands,
    positions: report.stats.positions,
    rows: report.stats.rows
  })

  return {
    window: { start: startStr, end: endStr },
    filename,
    storage_path,
    stats: report.stats
  }
}
