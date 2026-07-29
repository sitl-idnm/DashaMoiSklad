import ExcelJS from 'exceljs'
import { COLUMNS, type Record } from './moysklad'

const IMAGE_PX = 80

/** Собирает XLSX «лист сборки» из записей, встраивая фото товаров. */
export async function buildXlsx(records: Record[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Лист сборки')

  ws.columns = [
    { header: 'Ячейка', width: 18 },
    { header: 'Товар', width: 40 },
    { header: 'Фото', width: 14 },
    { header: 'Артикул', width: 24 },
    { header: 'Штрихкод', width: 18 },
    { header: 'Кол-во', width: 8 },
    { header: 'Клиент', width: 30 },
    { header: '№ заказа', width: 16 },
    { header: 'Ссылка на этикетку', width: 55 },
    { header: 'Дата заказа', width: 20 }
  ]

  // Шапка
  const head = ws.getRow(1)
  head.font = { bold: true, size: 10, color: { argb: 'FF4A4A4A' } }
  head.alignment = { vertical: 'middle' }
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F6' } }
  })

  records.forEach((rec, i) => {
    const rowNumber = i + 2 // 1 — шапка
    ws.addRow([
      rec['Ячейка'], rec['Товар'], '', rec['Артикул'], rec['Штрихкод'],
      rec['Кол-во'], rec['Клиент'], rec['№ заказа'],
      rec['Ссылка на этикетку'], rec['Дата заказа']
    ])
    ws.getRow(rowNumber).alignment = { wrapText: true, vertical: 'middle' }

    if (rec.image) {
      try {
        const imageId = wb.addImage({ buffer: rec.image as any, extension: 'png' })
        ws.addImage(imageId, {
          tl: { col: 2, row: rowNumber - 1 }, // 0-индексация; колонка C, текущая строка
          ext: { width: IMAGE_PX, height: IMAGE_PX },
          editAs: 'oneCell'
        })
        ws.getRow(rowNumber).height = IMAGE_PX * 0.78
      } catch {
        /* пропускаем битую картинку */
      }
    }
  })

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}
