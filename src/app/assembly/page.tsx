'use client'

import { useEffect, useState } from 'react'

interface Row {
  order_id: number
  client: string
  title: string
  vendor_code: string
  barcode: string
  qty: number
  sticker: string
  order_date: string
  photo: string
  status: string
}
interface Scope {
  clients: { id: string; name: string }[]
  groups: { id: string; name: string; size: number }[]
}

export default function AssemblyPage() {
  const [scope, setScope] = useState<Scope>({ clients: [], groups: [] })
  const [sel, setSel] = useState<string>('') // "client:<id>" | "group:<id>"
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/assembly/scope', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setScope({ clients: d.clients, groups: d.groups })
      })
      .catch(() => {})
  }, [])

  async function load() {
    if (!sel) return
    setLoading(true)
    setError('')
    setRows([])
    try {
      const [kind, id] = sel.split(':')
      const q = kind === 'group' ? `groupId=${id}` : `clientId=${id}`
      const r = await fetch(`/api/assembly?${q}`, { cache: 'no-store' })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setRows(d.rows)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const scanHref = sel ? `/assembly/scan?${sel.replace(':', '=')}` : '#'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        <span className="badge">Л</span> Лист сборки (из ВБ)
      </div>
      <h1 style={{ margin: '0 0 16px', fontSize: 26 }}>Лист сборки</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={selectStyle}>
          <option value="">— выберите клиента или группу —</option>
          {scope.groups.length > 0 && (
            <optgroup label="Группы">
              {scope.groups.map((g) => (
                <option key={g.id} value={`group:${g.id}`}>
                  {g.name} ({g.size})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Клиенты">
            {scope.clients.map((c) => (
              <option key={c.id} value={`client:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button className="btn" onClick={load} disabled={!sel || loading}>
          {loading ? 'Собираю…' : 'Построить'}
        </button>
        {rows.length > 0 && (
          <a className="btn" href={scanHref} style={{ textDecoration: 'none' }}>
            Сканировать →
          </a>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {rows.length > 0 && (
        <>
          <p style={{ color: 'rgba(22,24,27,.55)', fontSize: 14 }}>Заданий: {rows.length}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(22,24,27,.5)' }}>
                  <th style={th}>Фото</th>
                  <th style={th}>Товар</th>
                  <th style={th}>Артикул</th>
                  <th style={th}>Штрихкод</th>
                  <th style={th}>Кол-во</th>
                  <th style={th}>Клиент</th>
                  <th style={th}>№ задания</th>
                  <th style={th}>Стикер</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.order_id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                    <td style={td}>
                      {r.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photo} alt="" width={40} height={40} style={{ borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={td}>{r.title || '—'}</td>
                    <td style={td}>{r.vendor_code || '—'}</td>
                    <td style={td}>{r.barcode || '—'}</td>
                    <td style={td}>{r.qty}</td>
                    <td style={td}>{r.client}</td>
                    <td style={td}>{r.order_id}</td>
                    <td style={td}>{r.sticker || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }
const selectStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,.12)',
  padding: '0 12px',
  fontSize: 14,
  minWidth: 280,
  background: '#fff'
}
