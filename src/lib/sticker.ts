import 'server-only'

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
      const buf = new Uint8Array(await res.arrayBuffer())
      // unpdf — извлечение текста из PDF, собран под serverless (Vercel/Workers).
      // Ленивый импорт + try/catch: если не загрузится — стикер пустой, роут жив.
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(buf)
      const { text } = await extractText(pdf, { mergePages: true })
      const full = Array.isArray(text) ? text.join('\n') : text
      const num = parseStickerNumber(full || '')
      if (num) return num
    } catch {
      // повторим
    }
  }
  return ''
}
