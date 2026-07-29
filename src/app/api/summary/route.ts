import { NextResponse } from 'next/server'
import { listSheets, supabaseConfigured } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Bar = { label: string; orders: number; units: number }

/** Сводная статистика за последние 30 дней из сохранённых листов. */
export async function GET() {
  if (!supabaseConfigured()) {
    return NextResponse.json({ configured: false })
  }
  try {
    const sheets = await listSheets(60)
    // Сводку считаем начиная с этой даты (МСК) и только по ежедневным (auto)
    // листам — ручные ad-hoc отчёты пересекаются с сутками и задваивали бы цифры.
    const SINCE = new Date('2026-07-29T00:00:00+03:00').getTime()
    const rows = sheets.filter(
      (s) => s.source === 'auto' && new Date(s.window_end).getTime() >= SINCE
    )

    let orders = 0
    let positions = 0
    let units = 0
    let revenue = 0
    const clients = new Set<string>()
    const byClient = new Map<string, { orders: Set<string>; units: number }>()
    const byProduct = new Map<string, number>()

    // Ряд активности по дням (по дате конца окна), по возрастанию.
    const series = [...rows]
      .sort((a, b) => new Date(a.window_end).getTime() - new Date(b.window_end).getTime())
      .map((s) => {
        let u = 0
        for (const r of s.data || []) u += Number(r['Кол-во']) || 0
        return {
          date: s.window_end.slice(0, 10),
          orders: s.demands,
          units: u,
          revenue: Number(s.revenue) || 0
        }
      })

    for (const s of rows) {
      orders += s.demands
      positions += s.positions
      revenue += Number(s.revenue) || 0
      for (const r of s.data || []) {
        const qty = Number(r['Кол-во']) || 0
        units += qty
        const client = String(r['Клиент'] || '').trim()
        const product = String(r['Товар'] || '').trim()
        const order = String(r['№ заказа'] || '').trim()
        if (client) {
          clients.add(client)
          const c = byClient.get(client) || { orders: new Set<string>(), units: 0 }
          if (order) c.orders.add(order)
          c.units += qty
          byClient.set(client, c)
        }
        if (product && product !== '(позиции отсутствуют)') {
          byProduct.set(product, (byProduct.get(product) || 0) + qty)
        }
      }
    }

    const topClients: Bar[] = [...byClient.entries()]
      .map(([label, v]) => ({ label, orders: v.orders.size, units: v.units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 6)

    const topProducts: Bar[] = [...byProduct.entries()]
      .map(([label, units]) => ({ label, orders: 0, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 6)

    return NextResponse.json({
      configured: true,
      totals: {
        orders,
        positions,
        units,
        revenue,
        clients: clients.size,
        activeDays: rows.filter((s) => s.rows > 0).length
      },
      series,
      topClients,
      topProducts
    })
  } catch (e: any) {
    return NextResponse.json({ configured: true, error: String(e?.message || e) }, { status: 502 })
  }
}
