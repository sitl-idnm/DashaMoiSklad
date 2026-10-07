/**
 * Персистентность листов сборки в Postgres (замена части supabase.ts).
 * Только серверный код.
 */
import 'server-only'
import { query } from './db'

/** Одна строка отчёта в текстовом виде (+ превью-миниатюра data-URI). */
export type SheetDataRow = { [column: string]: string | number }

export interface SheetRow {
  id: number
  window_start: string
  window_end: string
  filename: string
  storage_path: string
  demands: number
  positions: number
  rows: number
  revenue: number
  data: SheetDataRow[]
  source: 'auto' | 'manual'
  created_at: string
}

/** Upsert по окну [window_start, window_end). */
export async function insertSheet(row: Omit<SheetRow, 'id' | 'created_at'>): Promise<void> {
  await query(
    `insert into assembly_sheets
       (window_start, window_end, filename, storage_path,
        demands, positions, rows, revenue, data, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     on conflict (window_start, window_end) do update set
       filename     = excluded.filename,
       storage_path = excluded.storage_path,
       demands      = excluded.demands,
       positions    = excluded.positions,
       rows         = excluded.rows,
       revenue      = excluded.revenue,
       data         = excluded.data,
       source       = excluded.source`,
    [
      row.window_start,
      row.window_end,
      row.filename,
      row.storage_path,
      row.demands,
      row.positions,
      row.rows,
      row.revenue,
      JSON.stringify(row.data ?? []),
      row.source
    ]
  )
}

/** Список готовых листов, свежие сверху (с полными данными — для сводки/экспорта). */
export async function listSheets(limit = 60): Promise<SheetRow[]> {
  return query<SheetRow>(
    `select id, window_start, window_end, filename, storage_path,
            demands, positions, rows, revenue, data, source, created_at
       from assembly_sheets
      order by window_start desc
      limit $1`,
    [limit]
  )
}

/** Мета листов БЕЗ тяжёлого jsonb data (для списка в UI — строки грузятся лениво). */
export type SheetMeta = Omit<SheetRow, 'data'>
export async function listSheetsMeta(limit = 60): Promise<SheetMeta[]> {
  return query<SheetMeta>(
    `select id, window_start, window_end, filename, storage_path,
            demands, positions, rows, revenue, source, created_at
       from assembly_sheets
      order by window_start desc
      limit $1`,
    [limit]
  )
}

/** Последний автособранный лист целиком (для авто-печати на локации). */
export async function getLatestAutoSheet(): Promise<SheetRow | null> {
  const rows = await query<SheetRow>(
    `select id, window_start, window_end, filename, storage_path,
            demands, positions, rows, revenue, data, source, created_at
       from assembly_sheets
      where source = 'auto'
      order by window_start desc
      limit 1`
  )
  return rows[0] ?? null
}

/** Полный лист по id (мета + данные). */
export async function getSheetById(id: number): Promise<SheetRow | null> {
  const rows = await query<SheetRow>(
    `select id, window_start, window_end, filename, storage_path,
            demands, positions, rows, revenue, data, source, created_at
       from assembly_sheets where id = $1`,
    [id]
  )
  return rows[0] ?? null
}

/** Данные (строки+превью) одного листа — грузятся по клику на день. */
export async function getSheetData(id: number): Promise<SheetDataRow[] | null> {
  const row = await query<{ data: SheetDataRow[] }>(
    `select data from assembly_sheets where id = $1`,
    [id]
  )
  return row[0] ? row[0].data ?? [] : null
}
