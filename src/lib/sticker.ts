import 'server-only'
import { PDFParse } from 'pdf-parse'

/**
 * Номер WB-стикера из текста PDF-этикетки MPsklad.
 * Пример содержимого: "WB\t\n5648880\t\n9439\n\n-- 1 of 1 --".
 * Возвращает "5648880 9439" или '' если не найден.
 */
export function parseStickerNumber(text: string): string {
  const clean = text.replace(/--.*?--/gs, ' ')
  const m = clean.match(/WB\s+(\d{5,})\s+(\d{2,})/)
  if (m) return `${m[1]} ${m[2]}`
  // Фолбэк: длинная числовая группа (возможно с пробелом).
  const d = clean.match(/\d[\d\s]{7,}\d/)
  return d ? d[0].replace(/\s+/g, ' ').trim() : ''
}

/** Скачать PDF-этикетку и вытащить номер стикера. До 2 попыток; ошибки → ''. */
export async function fetchStickerNumber(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const parser = new PDFParse({ data: buf })
      const r = await parser.getText()
      const num = parseStickerNumber(r.text || '')
      if (num) return num
    } catch {
      // повторим
    }
  }
  return ''
}
