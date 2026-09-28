import { buildReport, computeWindow, type Record as MsRecord } from './moysklad'
import { buildXlsx } from './xlsx'
import { saveFile } from './storage'
import { insertSheet, type SheetDataRow } from './sheets'
import { fetchStickerNumber } from './sticker'
import { marketplaceTokensByOrg, fetchWbStickers } from './wbSticker'
import { orgClientMap, photoUrlsByBarcode } from './wbProducts'

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

  // ── Стикер ──────────────────────────────────────────────────────────────
  // 1) Сначала пробуем взять номер стикера ПРЯМО из кабинета ВБ: order.name из
  //    МойСклада = WB order id, а marketplace-токен берём у клиента, чья
  //    организация (moysklad_org_id) совпала. Это быстрее и не зависит от MPsklad.
  const ordersByOrg = new Map<string, Set<number>>()
  for (const rec of report.records) {
    const orgId = rec._orgId
    const orderId = Number(rec['№ заказа'])
    if (!orgId || !Number.isFinite(orderId)) continue
    let set = ordersByOrg.get(orgId)
    if (!set) ordersByOrg.set(orgId, (set = new Set<number>()))
    set.add(orderId)
  }
  let wbStickers = new Map<number, string>()
  try {
    const tokens = await marketplaceTokensByOrg()
    if (tokens.size > 0) wbStickers = await fetchWbStickers(ordersByOrg, tokens)
  } catch {
    // Нет БД/ключей/связи — целиком уходим на старый способ ниже.
  }

  // 2) Для заказов без стикера из ВБ — СТАРЫЙ способ: номер из PDF-этикетки MPsklad
  //    (нет доступа к кабинету, невалидный ключ, заказ уже отгружен и т.п.).
  const needPdf = report.records.filter((r) => !wbStickers.has(Number(r['№ заказа'])))
  const labelUrls = Array.from(
    new Set(
      needPdf
        .map((r) => String(r['Ссылка на этикетку'] || '').trim())
        .filter((u) => u.startsWith(LABEL_HOST))
    )
  )
  // Этикетки MPsklad генерятся ~4–5 c каждая — качаем параллельно с общим
  // бюджетом времени. Не успевшие за бюджет останутся без номера (отчёт соберётся).
  const stickerBudget = stickerDeadline - Date.now()
  const pdfStickers =
    stickerBudget > 500 && labelUrls.length
      ? await mapPool(labelUrls, 12, fetchStickerNumber, stickerBudget)
      : new Map<string, string>()

  for (const rec of report.records) {
    const orderId = Number(rec['№ заказа'])
    rec['Стикер'] =
      wbStickers.get(orderId) ||
      pdfStickers.get(String(rec['Ссылка на этикетку'] || '').trim()) ||
      ''
  }

  // ── Фото из кабинета ВБ ───────────────────────────────────────────────────
  // В МойСкладе фото часто нет — подставляем URL с CDN ВБ по штрихкоду
  // (из синхронизированных карточек клиента). Приоритет у ВБ; нет синка/совпадения
  // → останется фото МойСклада (если есть) или пусто.
  const splitBarcodes = (rec: MsRecord) =>
    String(rec['Штрихкод'] || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  const wbPhotoByRec = new Map<MsRecord, string>()
  try {
    const orgClients = await orgClientMap()
    const barcodesByClient = new Map<string, Set<string>>()
    for (const rec of report.records) {
      const clientId = rec._orgId ? orgClients.get(rec._orgId) : undefined
      if (!clientId) continue
      let set = barcodesByClient.get(clientId)
      if (!set) barcodesByClient.set(clientId, (set = new Set<string>()))
      for (const b of splitBarcodes(rec)) set.add(b)
    }
    const photoMap = new Map<string, string>() // `${clientId}|${barcode}` → url
    for (const [clientId, bset] of barcodesByClient) {
      const m = await photoUrlsByBarcode(clientId, Array.from(bset))
      for (const [bc, url] of m) photoMap.set(`${clientId}|${bc}`, url)
    }
    if (photoMap.size) {
      for (const rec of report.records) {
        const clientId = rec._orgId ? orgClients.get(rec._orgId) : undefined
        if (!clientId) continue
        for (const b of splitBarcodes(rec)) {
          const url = photoMap.get(`${clientId}|${b}`)
          if (url) {
            wbPhotoByRec.set(rec, url)
            break
          }
        }
      }
    }
  } catch {
    // Нет БД/синка товаров — фото возьмём из МойСклада (если есть) ниже.
  }

  const xlsx = await buildXlsx(report.records)

  const filename = `assembly_sheet_${slug(startStr)}__${slug(endStr)}.xlsx`
  const storage_path = `sheets/${filename}`

  // Текстовые строки + фото — для таблицы в UI. Приоритет: URL фото из кабинета
  // ВБ, иначе миниатюра МойСклада (data-URI). _orgId — внутреннее, в UI/файл не пишем.
  const data: SheetDataRow[] = report.records.map((rec) => {
    const { image, _orgId, ...rest } = rec
    return { ...rest, _img: wbPhotoByRec.get(rec) || (image ? toDataUri(image) : '') }
  })

  await saveFile(storage_path, xlsx)
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
