'use client'

import { useEffect, useState } from 'react'

interface DiffItem {
  wb_nm_id: number
  vendor_code: string | null
  title: string | null
  barcodes: string[]
  action: 'create' | 'update' | 'conflict'
  ms_name?: string
  reason?: string
}
interface Diff {
  ms_count: number
  stats: { create: number; update: number; conflict: number; total: number }
  items: DiffItem[]
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Создать',
  update: 'Обновить',
  conflict: 'Конфликт'
}
const ACTION_COLOR: Record<string, string> = {
  create: '#2e9e5b',
  update: '#2d6cdf',
  conflict: '#c0392b'
}

export default function DiffPage({ params }: { params: { id: string } }) {
  const [diff, setDiff] = useState<Diff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')

  async function run() {
    setLoading(true)
    setError('')
    setDiff(null)
    try {
      const r = await fetch(`/api/admin/clients/${params.id}/diff?entity=products`, {
        cache: 'no-store'
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setDiff(d.diff)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = (diff?.items || []).filter((i) => filter === 'all' || i.action === filter)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 20px' }}>
      <a className="open-link" href="/admin/clients">
        ← К клиентам
      </a>
      <h1 style={{ margin: '10px 0 6px', fontSize: 26 }}>Сверка товаров с МойСклад</h1>
      <p style={{ color: 'rgba(22,24,27,.55)', marginTop: 0 }}>
        Предпросмотр (dry-run). В МойСклад ничего не записывается.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0' }}>
        <button className="btn" onClick={run} disabled={loading}>
          {loading ? 'Считаю…' : 'Пересчитать'}
        </button>
        {diff && (
          <span style={{ fontSize: 14, color: 'rgba(22,24,27,.6)' }}>
            В МойСклад найдено позиций: {diff.ms_count}
          </span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {diff && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 16px' }}>
            {(['all', 'create', 'update', 'conflict'] as const).map((k) => (
              <button
                key={k}
                className="preset"
                onClick={() => setFilter(k)}
                style={filter === k ? { background: 'var(--wine)', color: '#fff' } : undefined}
              >
                {k === 'all'
                  ? `Все · ${diff.stats.total}`
                  : `${ACTION_LABEL[k]} · ${diff.stats[k]}`}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(22,24,27,.5)' }}>
                  <th style={th}>Действие</th>
                  <th style={th}>nmID</th>
                  <th style={th}>Артикул</th>
                  <th style={th}>Товар</th>
                  <th style={th}>Баркоды</th>
                  <th style={th}>МойСклад</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.wb_nm_id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                    <td style={td}>
                      <span style={{ color: ACTION_COLOR[i.action], fontWeight: 600 }}>
                        {ACTION_LABEL[i.action]}
                      </span>
                    </td>
                    <td style={td}>{i.wb_nm_id}</td>
                    <td style={td}>{i.vendor_code || '—'}</td>
                    <td style={td}>{i.title || '—'}</td>
                    <td style={{ ...td, color: 'rgba(22,24,27,.5)' }}>
                      {i.barcodes.slice(0, 2).join(', ')}
                      {i.barcodes.length > 2 ? '…' : ''}
                    </td>
                    <td style={td}>
                      {i.ms_name || '—'}
                      {i.reason ? (
                        <div style={{ color: '#c0392b', fontSize: 12 }}>{i.reason}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {diff.items.length < diff.stats.total && (
            <p style={{ color: 'rgba(22,24,27,.5)', fontSize: 13, marginTop: 10 }}>
              Показаны первые {diff.items.length} из {diff.stats.total}. Счётчики — по всем.
            </p>
          )}
          <p style={{ color: 'rgba(22,24,27,.5)', fontSize: 13, marginTop: 16 }}>
            Запись в МойСклад (создание/обновление) будет добавлена отдельным этапом,
            за явным подтверждением и по одной сущности.
          </p>
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' }
