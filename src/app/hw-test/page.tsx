'use client'

/**
 * Самопроверка оборудования склада БЕЗ БД/ВБ/МойСклад.
 * — Сканер КИЗ (DataMatrix) как HID-клавиатура: ловим ввод, разбираем GS1.
 * — Принтер этикеток: печатаем тестовую этикетку 58×40 мм (HTML и PNG-путь,
 *   тем же механизмом через скрытый iframe, что и боевой стикер ВБ).
 * Публичная страница (см. middleware PUBLIC), чтобы проверить железо сразу.
 */
import { useEffect, useRef, useState } from 'react'

interface ScanEntry {
  at: string
  raw: string
  len: number
  ais: { ai: string; label: string; value: string }[]
  looksKiz: boolean
}

// Разбор GS1 Application Identifiers (упрощённо, ключевое для КИЗ Честного Знака).
const GS = String.fromCharCode(29) // групповой разделитель <GS>
const AI_FIXED: Record<string, { len: number; label: string }> = {
  '01': { len: 14, label: 'GTIN' },
  '21': { len: 0, label: 'Серийный №' }, // переменная длина до <GS>
  '91': { len: 0, label: 'Ключ проверки' },
  '92': { len: 0, label: 'Код проверки (crypto)' },
  '93': { len: 0, label: 'Проверочный' },
  '10': { len: 0, label: 'Партия' },
  '17': { len: 6, label: 'Годен до' }
}

function parseGs1(raw: string) {
  const ais: { ai: string; label: string; value: string }[] = []
  // Убираем возможный префикс символа FNC1/GS в начале.
  let s = raw.replace(/^/, '')
  let guard = 0
  while (s.length >= 2 && guard++ < 20) {
    const ai = s.slice(0, 2)
    const def = AI_FIXED[ai]
    if (!def) break
    s = s.slice(2)
    let value: string
    if (def.len > 0) {
      value = s.slice(0, def.len)
      s = s.slice(def.len)
    } else {
      const gsIdx = s.indexOf(GS)
      if (gsIdx >= 0) {
        value = s.slice(0, gsIdx)
        s = s.slice(gsIdx + 1)
      } else {
        value = s
        s = ''
      }
    }
    ais.push({ ai, label: def.label, value })
    // после fixed-длины серийника КИЗ обычно идёт <GS>
    s = s.replace(/^/, '')
  }
  return ais
}

/** Печать base64-PNG через скрытый iframe — ТОЧНО тот же путь, что в боевом скане. */
function printPng(base64: string) {
  const html = `<html><head><style>
    @page { size: 58mm 40mm; margin: 0 }
    html,body { margin:0; padding:0 }
    body { display:flex; align-items:center; justify-content:center }
    img { width: 58mm; height: auto }
  </style></head><body onload="window.focus();window.print();">
    <img src="data:image/png;base64,${base64}" />
  </body></html>`
  printHtml(html)
}

function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(html)
    doc.close()
  }
  setTimeout(() => document.body.removeChild(iframe), 4000)
}

/** Тестовая этикетка 58×40 мм как HTML (проверка размера/полей принтера). */
function printTestLabelHtml() {
  const now = new Date().toLocaleString('ru-RU')
  const html = `<html><head><style>
    @page { size: 58mm 40mm; margin: 0 }
    html,body { margin:0; padding:0; font-family: Arial, sans-serif; }
    .lbl { width:58mm; height:40mm; box-sizing:border-box; padding:2mm;
           display:flex; flex-direction:column; justify-content:space-between;
           color:#000; }
    .big { font-size:34pt; font-weight:800; line-height:1; text-align:center; letter-spacing:2px; }
    .code { font-size:9pt; text-align:center; }
    .bars { height:9mm; margin:1mm 0; background:repeating-linear-gradient(
       90deg,#000 0,#000 0.4mm,#fff 0.4mm,#fff 0.9mm); }
    .foot { font-size:7pt; display:flex; justify-content:space-between; }
  </style></head><body onload="window.focus();window.print();">
    <div class="lbl">
      <div class="big">12&nbsp;34</div>
      <div class="bars"></div>
      <div class="code">ТЕСТ ПЕЧАТИ · 58×40 мм</div>
      <div class="foot"><span>WMS self-test</span><span>${now}</span></div>
    </div>
  </body></html>`
  printHtml(html)
}

/** Тестовая этикетка через canvas→PNG — проверяет ИМЕННО боевой путь печати PNG. */
function printTestLabelPng() {
  // 58×40 мм при 203 dpi (типовой термопринтер) ≈ 464×320 px.
  const w = 464
  const h = 320
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  ctx.font = 'bold 120px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('12 34', w / 2, 140)
  // псевдо-штрихкод
  for (let x = 30, i = 0; x < w - 30; x += 6, i++) {
    if (i % 2 === 0) ctx.fillRect(x, 170, 3, 70)
  }
  ctx.font = '20px Arial'
  ctx.fillText('ТЕСТ ПЕЧАТИ PNG · 58×40 мм', w / 2, 275)
  ctx.font = '14px Arial'
  ctx.fillText(new Date().toLocaleString('ru-RU'), w / 2, 300)
  const base64 = c.toDataURL('image/png').split(',')[1]
  printPng(base64)
}

export default function HwTestPage() {
  const [scans, setScans] = useState<ScanEntry[]>([])
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Держим фокус на скрытом поле — сканер печатает как клавиатура.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus()
    }, 600)
    return () => clearInterval(t)
  }, [])

  function onScan(e: React.FormEvent) {
    e.preventDefault()
    const raw = inputRef.current?.value ?? ''
    if (inputRef.current) inputRef.current.value = ''
    if (!raw) return
    const ais = parseGs1(raw)
    const looksKiz = ais.some((a) => a.ai === '01') && ais.some((a) => a.ai === '21')
    setScans((s) => [
      { at: new Date().toLocaleTimeString('ru-RU'), raw, len: raw.length, ais, looksKiz },
      ...s
    ].slice(0, 30))
  }

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a href="/" style={link}>← На главную</a>
        <h1 style={{ margin: '10px 0 4px' }}>Проверка оборудования</h1>
        <p style={{ color: 'rgba(255,255,255,.6)', marginTop: 0 }}>
          Без БД, ВБ и МойСклад. Открой эту страницу в браузере на том ПК, куда
          подключены сканер и принтер этикеток.
        </p>

        {/* ── Принтер ─────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>1. Принтер этикеток</h2>
          <p style={muted}>
            Печатает тестовую этикетку 58×40 мм тем же механизмом (скрытый iframe →
            системный диалог печати), что и боевой стикер ВБ. В диалоге выбери свой
            термопринтер, поля — «нет», масштаб — 100%.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={btn} onClick={printTestLabelPng}>Тест печати (PNG-путь)</button>
            <button style={btnGhost} onClick={printTestLabelHtml}>Тест печати (HTML)</button>
          </div>
        </section>

        {/* ── Сканер ──────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>2. Сканер КИЗ (DataMatrix)</h2>
          <p style={muted}>
            Поле ниже всегда в фокусе. Отсканируй КИЗ физическим сканером —
            он должен «напечатать» код и завершить Enter&#39;ом. Разберём GS1.
          </p>
          <form onSubmit={onScan}>
            <input
              ref={inputRef}
              autoFocus
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Курсор здесь — сканируйте…"
              style={{ ...scanInput, borderColor: focused ? '#7aa2ff' : 'rgba(255,255,255,.15)' }}
            />
          </form>
          <div style={{ fontSize: 12, color: focused ? '#7aa2ff' : '#ff6b6b', marginTop: 6 }}>
            {focused ? '● поле в фокусе — готово к скану' : '○ поле потеряло фокус (кликните по нему)'}
          </div>

          {scans.length === 0 ? (
            <div style={{ ...muted, marginTop: 14 }}>Сканов пока нет.</div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scans.map((s, i) => (
                <div key={i} style={scanRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                    <span>{s.at} · {s.len} симв.</span>
                    <span style={{ color: s.looksKiz ? '#2fbf71' : '#e0a94a' }}>
                      {s.looksKiz ? '✓ похоже на КИЗ (01+21)' : 'не распознан как КИЗ'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', margin: '4px 0' }}>
                    {s.raw.replace(new RegExp(GS, 'g'), '⟨GS⟩') || '—'}
                  </div>
                  {s.ais.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {s.ais.map((a, j) => (
                        <span key={j} style={aiChip}>
                          <b>{a.ai}</b> {a.label}: {a.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(120% 120% at 50% 0%, #2b2a31 0%, #242329 60%)',
  color: '#fff',
  padding: '24px 16px'
}
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 18,
  padding: 20,
  marginTop: 16
}
const h2: React.CSSProperties = { margin: '0 0 6px', fontSize: 18 }
const muted: React.CSSProperties = { color: 'rgba(255,255,255,.6)', fontSize: 14, marginTop: 0 }
const link: React.CSSProperties = { color: '#7aa2ff', textDecoration: 'none', fontSize: 14 }
const btn: React.CSSProperties = {
  height: 44, padding: '0 18px', borderRadius: 12, border: 'none',
  background: '#7aa2ff', color: '#12131a', fontWeight: 700, cursor: 'pointer', fontSize: 15
}
const btnGhost: React.CSSProperties = {
  height: 44, padding: '0 18px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,.2)', background: 'transparent',
  color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15
}
const scanInput: React.CSSProperties = {
  width: '100%', height: 52, borderRadius: 12, border: '2px solid rgba(255,255,255,.15)',
  background: 'rgba(0,0,0,.25)', color: '#fff', fontSize: 16, padding: '0 14px', outline: 'none'
}
const scanRow: React.CSSProperties = {
  background: 'rgba(0,0,0,.2)', border: '1px solid rgba(255,255,255,.06)',
  borderRadius: 12, padding: '10px 12px'
}
const aiChip: React.CSSProperties = {
  fontSize: 12, background: 'rgba(122,162,255,.15)', border: '1px solid rgba(122,162,255,.3)',
  borderRadius: 8, padding: '2px 8px', fontFamily: 'monospace'
}
