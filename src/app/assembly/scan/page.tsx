'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface Row {
  order_id: number
  client_id: string
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

/** Печать PNG-стикера (base64) через скрытый iframe и системный диалог печати. */
function printStickerPng(base64: string) {
  const html = `<html><head><style>
    @page { margin: 0 }
    body { margin: 0; display:flex; align-items:center; justify-content:center }
    img { width: 58mm; height: auto }
  </style></head><body onload="window.focus();window.print();">
    <img src="data:image/png;base64,${base64}" />
  </body></html>`
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(html)
    doc.close()
  }
  setTimeout(() => document.body.removeChild(iframe), 4000)
}

export default function ScanPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [bind, setBind] = useState(false) // безопасно по умолчанию: НЕ мутируем ВБ
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const clientId = sp.get('client')
    const groupId = sp.get('group')
    const q = groupId ? `groupId=${groupId}` : clientId ? `clientId=${clientId}` : ''
    if (!q) {
      setMessage('Не указан клиент или группа')
      return
    }
    fetch(`/api/assembly?${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.rows)
        else setMessage(d.error)
      })
      .catch((e) => setMessage(String(e?.message || e)))
  }, [])

  const current = rows[idx]
  const remaining = useMemo(() => rows.length - done.size, [rows.length, done])

  // Держим фокус на скрытом поле — физический сканер печатает как клавиатура.
  useEffect(() => {
    const t = setInterval(() => inputRef.current?.focus(), 800)
    return () => clearInterval(t)
  }, [])

  async function onScan(e: React.FormEvent) {
    e.preventDefault()
    const code = inputRef.current?.value.trim() || ''
    if (inputRef.current) inputRef.current.value = ''
    if (!current) return
    setStatus('sending')
    setMessage('')
    try {
      const r = await fetch('/api/assembly/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: current.client_id,
          orderId: current.order_id,
          code,
          bind
        })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error || 'Ошибка скана')
      if (d.sticker?.file) printStickerPng(d.sticker.file)
      setStatus('ok')
      setMessage(d.sticker?.file ? 'Стикер отправлен на печать' : 'Готово (стикер не получен)')
      setDone((s) => new Set(s).add(current.order_id))
      // Следующее незавершённое задание.
      setTimeout(() => {
        setIdx((i) => {
          let n = i + 1
          while (n < rows.length && done.has(rows[n].order_id)) n++
          return Math.min(n, rows.length)
        })
        setStatus('idle')
      }, 700)
    } catch (e: any) {
      setStatus('error')
      setMessage(String(e?.message || e))
    }
  }

  if (message && rows.length === 0) {
    return (
      <div style={wrap}>
        <a className="open-link" href="/assembly">← К листу</a>
        <div className="error" style={{ marginTop: 16 }}>{message}</div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a className="open-link" href="/assembly">← К листу</a>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={bind} onChange={(e) => setBind(e.target.checked)} />
          Привязывать КИЗ к ВБ (мутация кабинета)
        </label>
      </div>

      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.6)', margin: '8px 0 16px' }}>
        Осталось: {remaining} из {rows.length}
      </div>

      {current ? (
        <div style={card}>
          {current.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.photo}
              alt=""
              style={{ width: 220, height: 220, objectFit: 'cover', borderRadius: 16, background: '#111' }}
            />
          ) : (
            <div style={{ width: 220, height: 220, borderRadius: 16, background: '#111' }} />
          )}
          <h2 style={{ margin: '18px 0 4px', textAlign: 'center' }}>{current.title || '—'}</h2>
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}>
            {current.vendor_code} · {current.client}
          </div>
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
            {current.barcode || '—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, marginTop: 4 }}>
            Задание № {current.order_id}
          </div>

          <form onSubmit={onScan} style={{ marginTop: 20, width: '100%' }}>
            <input
              ref={inputRef}
              autoFocus
              placeholder="Отсканируйте КИЗ…"
              style={scanInput}
            />
          </form>

          <div
            style={{
              marginTop: 14,
              minHeight: 22,
              fontWeight: 600,
              color:
                status === 'ok' ? '#2fbf71' : status === 'error' ? '#ff6b6b' : 'rgba(255,255,255,.6)'
            }}
          >
            {status === 'sending' ? 'Обрабатываю…' : message}
          </div>
        </div>
      ) : (
        <div style={{ ...card, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Все задания обработаны 🎉</h2>
          <a className="open-link" href="/assembly" style={{ marginTop: 12 }}>
            Вернуться к листу
          </a>
        </div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(120% 120% at 50% 0%, #2b2a31 0%, #242329 60%)',
  color: '#fff',
  padding: '24px 16px',
  maxWidth: 560,
  margin: '0 auto'
}
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 24,
  padding: 28,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
}
const scanInput: React.CSSProperties = {
  width: '100%',
  height: 52,
  borderRadius: 12,
  border: '2px solid rgba(255,255,255,.15)',
  background: 'rgba(0,0,0,.25)',
  color: '#fff',
  fontSize: 18,
  textAlign: 'center',
  outline: 'none'
}
