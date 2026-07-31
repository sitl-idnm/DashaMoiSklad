'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { DateTimeWheel } from './DateTimeWheel'

type DataRow = { [column: string]: string | number }
interface Sheet {
  id: number
  filename: string
  window_start: string
  window_end: string
  demands: number
  positions: number
  rows: number
  data: DataRow[]
  source: 'auto' | 'manual'
  created_at: string
  url: string | null
}
interface Win {
  startStr: string
  endStr: string
}
type SumBar = { label: string; orders: number; units: number }
interface Summary {
  configured: boolean
  error?: string
  totals?: { orders: number; positions: number; units: number; revenue: number; clients: number; activeDays: number }
  series?: { date: string; orders: number; units: number; revenue: number }[]
  topClients?: SumBar[]
  topProducts?: SumBar[]
}

// Колонки внутренней (раскрывающейся) таблицы — порядок как в XLSX, без фото.
const DATA_COLS = [
  'Ячейка', 'Товар', 'Артикул', 'Штрихкод', 'Кол-во',
  'Клиент', '№ заказа', 'Стикер', 'Ссылка на этикетку', 'Дата заказа'
] as const

const CATS = { all: 'Все инструменты', sklad: 'Мой склад', reports: 'Отчёты' } as const
type Cat = keyof typeof CATS

export default function Panel() {
  const [cat, setCat] = useState<Cat>('all')
  const [view, setView] = useState<'dashboard' | 'tool' | 'summary'>('dashboard')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [win, setWin] = useState<Win | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(false)
  const [gen, setGen] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeImages, setRangeImages] = useState(true)
  const [genR, setGenR] = useState(false)
  const [tab, setTab] = useState<'auto' | 'manual'>('auto')
  const [showEmpty, setShowEmpty] = useState(false)

  function toggle(id: number) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function jfetch(url: string, init?: RequestInit) {
    const r = await fetch(url, init)
    const text = await r.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      const snippet = text.replace(/\s+/g, ' ').slice(0, 140)
      throw new Error(
        `сервер вернул не JSON (HTTP ${r.status})` +
          (r.status === 504 ? ' — функция не успела за отведённое время' : '') +
          (snippet ? `: ${snippet}` : '')
      )
    }
    return { ok: r.ok, status: r.status, data }
  }

  async function loadSheets() {
    setLoading(true)
    setErr('')
    try {
      const { data: d } = await jfetch('/api/sheets', { cache: 'no-store' })
      setConfigured(d.configured)
      setWin(d.window)
      setSheets(d.sheets || [])
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadSheets()
  }, [])

  async function generate() {
    setGen(true)
    setErr('')
    try {
      const { ok, status, data: d } = await jfetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!ok || !d?.ok) throw new Error(d?.error || `HTTP ${status}`)
      await loadSheets()
    } catch (e: any) {
      setErr('Ошибка генерации: ' + String(e?.message || e))
    } finally {
      setGen(false)
    }
  }

  async function generateRange() {
    if (!rangeStart || !rangeEnd) {
      setErr('Укажите начало и конец периода')
      return
    }
    setGenR(true)
    setErr('')
    try {
      const { ok, status, data: d } = await jfetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: toBackendDate(rangeStart),
          end: toBackendDate(rangeEnd),
          downloadImages: rangeImages,
          manual: true
        })
      })
      if (!ok || !d?.ok) throw new Error(d?.error || `HTTP ${status}`)
      setTab('manual')
      await loadSheets()
    } catch (e: any) {
      setErr('Ошибка генерации за период: ' + String(e?.message || e))
    } finally {
      setGenR(false)
    }
  }

  // Пресет: с предыдущего дня 13:00 до текущего момента (московское время у
  // пользователя = локальное, как и ручной ввод).
  function applyPresetPrevDay() {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - 1)
    start.setHours(13, 0, 0, 0)
    setRangeStart(toDatetimeLocal(start))
    setRangeEnd(toDatetimeLocal(now))
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function loadSummary() {
    setSummaryLoading(true)
    try {
      const r = await fetch('/api/summary', { cache: 'no-store' })
      setSummary(await r.json())
    } catch (e: any) {
      setSummary({ configured: true, error: String(e?.message || e) })
    } finally {
      setSummaryLoading(false)
    }
  }

  // Анимации появления — привязаны к вьюпорту (IntersectionObserver), а не к монтированию.
  useEffect(() => {
    const sel = '.stat,.range-card,.list-bar,.sheet-card,.sections .card,.kpi,.chart-card'
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !e.classList.contains('in'))
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [view, tab, showEmpty, sheets, summary, loading, summaryLoading, expanded])

  const openTool = () => setView('tool')
  const openSummary = () => { setView('summary'); if (!summary) loadSummary() }
  const back = () => setView('dashboard')

  // Листы текущей вкладки; пустые дни прячем, пока не включён toggle.
  const inTab = sheets.filter((s) => (s.source ?? 'auto') === tab)
  const visible = showEmpty ? inTab : inTab.filter((s) => s.rows > 0)
  const emptyCount = inTab.length - inTab.filter((s) => s.rows > 0).length
  const total = inTab.reduce((a, s) => a + (s.rows || 0), 0)

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span className="title">Панель инструментов</span>
            <span className="sub">внутренние утилиты</span>
          </div>
          <nav>
            <button className={`nav-item ${cat === 'all' ? 'active' : ''}`} onClick={() => { setCat('all'); back() }}>
              <IconGrid /><span>Все инструменты</span>
            </button>
            <button className={`nav-item ${cat === 'sklad' ? 'active' : ''}`} onClick={() => { setCat('sklad'); back() }}>
              <IconWarehouse /><span>Мой склад</span>
            </button>
            <button className={`nav-item ${cat === 'reports' ? 'active' : ''}`} onClick={() => { setCat('reports'); back() }}>
              <IconDoc /><span>Отчёты</span>
            </button>
          </nav>
        </div>
        <div className="profile">
          <span className="avatar">СГ</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name">City Group</div>
            <div className="role">оператор склада</div>
          </div>
          <button className="logout" onClick={logout} title="Выйти" aria-label="Выйти">
            <IconLogout />
          </button>
        </div>
      </aside>

      <main>
        <div className="topbar">
          {view === 'dashboard' ? (
            <h1>{CATS[cat]}</h1>
          ) : (
            <button className="back" onClick={back}>
              <IconBack /><span>Назад к дашборду</span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <div className="search"><IconSearch /><span>Поиск инструмента…</span></div>
            <div className="icon-btn"><IconBell /></div>
          </div>
        </div>

        {view === 'dashboard' && (
          <div className="sections">
            {(cat === 'all' || cat === 'sklad') && (
              <section>
                <div className="eyebrow"><span className="badge"><IconWarehouse s={14} /></span><span className="label">мой склад</span></div>
                <div className="grid">
                  <div className="card clickable" onClick={openTool}>
                    <h3>Лист сборки</h3>
                    <p>Отгрузки за сутки (13:00–13:00): ячейка, товар, артикул, штрихкод, клиент, ссылка на этикетку и фото. Готовый XLSX.</p>
                    <div className="card-foot"><span className="chip ready">готово</span><span className="open-link">Открыть →</span></div>
                  </div>
                  <div className="card">
                    <h3>Остатки товаров</h3>
                    <p>Текущие остатки по складам и ячейкам с выгрузкой в таблицу.</p>
                    <div className="card-foot"><span className="chip soon">скоро</span></div>
                  </div>
                </div>
              </section>
            )}
            {(cat === 'all' || cat === 'reports') && (
              <section>
                <div className="eyebrow"><span className="badge"><IconChart s={14} /></span><span className="label">аналитика</span></div>
                <div className="grid">
                  <div className="card clickable" onClick={openSummary}>
                    <h3>Сводка за месяц</h3>
                    <p>Заказы, клиенты, единицы и выручка за 30 дней. Активность по дням, самые активные клиенты и топ товаров — с графиками.</p>
                    <div className="card-foot"><span className="chip ready">готово</span><span className="open-link">Открыть →</span></div>
                  </div>
                </div>
              </section>
            )}
            {(cat === 'all' || cat === 'reports') && (
              <section>
                <div className="eyebrow"><span className="badge"><IconDoc s={14} /></span><span className="label">отчёты</span></div>
                <div className="grid">
                  <div className="card">
                    <h3>Выгрузка заказов</h3>
                    <p>Заказы покупателей за период с фильтрами по статусу и клиенту.</p>
                    <div className="card-foot"><span className="chip soon">скоро</span></div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {view === 'tool' && (
          <div className="tool">
            <div>
              <h1>Лист сборки</h1>
              <p className="sub">Отчёт формируется автоматически каждый день в 13:05. Здесь можно скачать готовые листы или собрать вручную за текущее окно.</p>
            </div>

            <div className="controls">
              <div className="window-box">
                Текущее окно: <b>{win ? win.startStr : '…'}</b> — <b>{win ? win.endStr : '…'}</b>
              </div>
              <button className="btn" onClick={generate} disabled={gen}>
                {gen ? <><span className="spinner" />Собираю…</> : 'Сформировать сейчас'}
              </button>
            </div>

            <div className="range-card">
              <div className="range-head">
                <IconCalendar />
                <span>Собрать за произвольный период</span>
              </div>
              <div className="range-presets">
                <span className="range-presets-label">Быстро:</span>
                <button type="button" className="preset" onClick={applyPresetPrevDay}>
                  Пред. день 13:00 → сейчас
                </button>
              </div>
              <div className="range-row">
                <div className="range-field">
                  <span>Начало</span>
                  <DateTimeWheel value={rangeStart} onChange={setRangeStart} />
                </div>
                <div className="range-field">
                  <span>Конец</span>
                  <DateTimeWheel value={rangeEnd} onChange={setRangeEnd} />
                </div>
                <label className="checkbox">
                  <input type="checkbox" checked={rangeImages} onChange={(e) => setRangeImages(e.target.checked)} />
                  с фото
                </label>
                <button className="btn" onClick={generateRange} disabled={genR}>
                  {genR ? <><span className="spinner" />Собираю…</> : 'Собрать за период'}
                </button>
              </div>
              <p className="hint">Границы — по московскому времени. Большой период с фото собирается дольше.</p>
            </div>

            {!configured && (
              <div className="error">Supabase не настроен: задайте SUPABASE_URL и SUPABASE_ANON_KEY в переменных окружения.</div>
            )}
            {err && <div className="error">{err}</div>}

            <div className="stats">
              <div className="stat"><div className="num"><CountUp value={visible.length} /></div><div className="cap">{tab === 'auto' ? 'дней с отгрузками' : 'ручных отчётов'}</div></div>
              <div className="stat"><div className="num"><CountUp value={inTab[0]?.demands ?? 0} /></div><div className="cap">отгрузок (последний)</div></div>
              <div className="stat"><div className="num"><CountUp value={total} /></div><div className="cap">строк всего</div></div>
              <div className="stat dark"><div className="num">13:00</div><div className="cap">граница суток</div></div>
            </div>

            <div className="list-bar">
              <div className="tabs">
                <button className={`tab ${tab === 'auto' ? 'active' : ''}`} onClick={() => setTab('auto')}>Ежедневные</button>
                <button className={`tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>Ручные</button>
              </div>
              {tab === 'auto' && (
                <label className="switch-wrap">
                  <span className="switch-label">показывать пустые{emptyCount > 0 ? ` (${emptyCount})` : ''}</span>
                  <span className={`switch ${showEmpty ? 'on' : ''}`} onClick={() => setShowEmpty((v) => !v)} role="switch" aria-checked={showEmpty}>
                    <span className="knob" />
                  </span>
                </label>
              )}
            </div>

            <div className="sheet-list">
              {loading && <div className="list-empty">Загрузка…</div>}
              {!loading && visible.length === 0 && (
                <div className="list-empty">
                  {tab === 'manual'
                    ? 'Ручных отчётов пока нет. Соберите за период выше.'
                    : inTab.length === 0
                      ? 'Пока нет готовых листов. Нажмите «Сформировать сейчас» или дождитесь ежедневного запуска.'
                      : 'За этот период дней с отгрузками нет. Включите «показывать пустые», чтобы увидеть все сутки.'}
                </div>
              )}
              {visible.map((s) => {
                const open = expanded.has(s.id)
                return (
                  <div className={`sheet-card ${open ? 'open' : ''}`} key={s.id}>
                    <div className="sheet-main" onClick={() => toggle(s.id)}>
                      <DateBadge iso={s.window_end} />
                      <div className="sheet-info">
                        <span className="sheet-day">{fmtDay(s.window_end)}</span>
                        <span className="sheet-win">{fmtWin(s.window_start)} → {fmtWin(s.window_end)}</span>
                      </div>
                      <div className="sheet-metrics">
                        <span className="metric"><b>{s.demands}</b><span>отгрузок</span></span>
                        <span className="metric"><b>{s.positions}</b><span>позиций</span></span>
                        <span className="metric"><b>{s.rows}</b><span>строк</span></span>
                      </div>
                      <span className="sheet-created">{fmtDt(s.created_at)}</span>
                      <div className="sheet-actions">
                        {s.url && (
                          <a className="btn-dl" href={s.url} onClick={(e) => e.stopPropagation()}>Скачать</a>
                        )}
                        <button
                          className={`chevron ${open ? 'up' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggle(s.id) }}
                          aria-label={open ? 'Свернуть' : 'Развернуть'}
                          title={open ? 'Свернуть' : 'Показать таблицу'}
                        >
                          <IconChevron />
                        </button>
                      </div>
                    </div>
                    {open && (
                      <div className="sheet-detail">
                        {s.data && s.data.length > 0 ? (
                          <div className="detail-scroll">
                            <table className="detail-table">
                              <thead>
                                <tr>
                                  <th className="th-img">фото</th>
                                  {DATA_COLS.map((c) => <th key={c}>{c}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {s.data.map((row, i) => (
                                  <tr key={i}>
                                    <td className="img-cell">
                                      {row._img
                                        ? <img src={String(row._img)} alt="" loading="lazy" />
                                        : <span className="muted">—</span>}
                                    </td>
                                    {DATA_COLS.map((c) => (
                                      <td key={c} className={c === 'Стикер' ? 'sticker-cell' : undefined}>
                                        {c === 'Ссылка на этикетку' && row[c]
                                          ? <a className="sticker-link" href={String(row[c])} target="_blank" rel="noreferrer">открыть ↗</a>
                                          : formatCell(c, row[c])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="muted" style={{ padding: '4px 2px' }}>Данных по строкам нет (пустое окно или лист собран без сохранения строк).</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'summary' && (
          <div className="summary">
            <div>
              <h1>Сводка за месяц</h1>
              <p className="sub">Данные за последние 30 дней по сохранённым листам сборки.</p>
            </div>

            {summaryLoading && <div className="list-empty">Считаю статистику…</div>}
            {!summaryLoading && summary?.error && <div className="error">Не удалось получить сводку: {summary.error}</div>}

            {!summaryLoading && summary?.totals && (
              <>
                <div className="summary-kpis">
                  <div className="kpi"><div className="kpi-num"><CountUp value={summary.totals.orders} /></div><div className="kpi-cap">заказов</div></div>
                  <div className="kpi"><div className="kpi-num"><CountUp value={summary.totals.clients} /></div><div className="kpi-cap">клиентов</div></div>
                  <div className="kpi"><div className="kpi-num"><CountUp value={summary.totals.units} /></div><div className="kpi-cap">единиц отгружено</div></div>
                  <div className="kpi accent"><div className="kpi-num">₽&nbsp;<CountUp value={summary.totals.revenue} /></div><div className="kpi-cap">выручка</div></div>
                  <div className="kpi"><div className="kpi-num"><CountUp value={summary.totals.activeDays} /></div><div className="kpi-cap">активных дней</div></div>
                </div>

                <div className="chart-card">
                  <div className="chart-head">Активность по дням — единиц отгружено</div>
                  <DayBars series={summary.series || []} />
                </div>

                <div className="chart-grid">
                  <div className="chart-card">
                    <div className="chart-head">Самые активные клиенты</div>
                    <BarList items={summary.topClients || []} unit="ед." />
                  </div>
                  <div className="chart-card">
                    <div className="chart-head">Топ товаров</div>
                    <BarList items={summary.topProducts || []} unit="ед." />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function fmtWin(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function fmtDt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
/** Календарная плитка: день + месяц (по дате конца окна = «день листа»). */
function DateBadge({ iso }: { iso: string }) {
  const d = new Date(iso)
  return (
    <span className="date-badge">
      <span className="db-day">{d.getDate()}</span>
      <span className="db-mon">{MONTHS[d.getMonth()]}</span>
    </span>
  )
}
/** «пн, 29 июля» — человекочитаемый заголовок дня по дате конца окна. */
function fmtDay(iso: string) {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Столбики активности по дням. Высота растёт при попадании карточки в вьюпорт (.in). */
function DayBars({ series }: { series: { date: string; units: number }[] }) {
  const data = series.length ? series : [{ date: '', units: 0 }]
  const max = Math.max(1, ...data.map((d) => d.units))
  const n = data.length
  const step = Math.max(1, Math.ceil(n / 14))
  return (
    <div className="daybars">
      {data.map((d, i) => {
        const dd = d.date ? d.date.slice(8, 10) : ''
        const showLabel = i % step === 0 || i === n - 1
        const h = Math.round((d.units / max) * 86)
        return (
          <div className="daybar" key={d.date + i} title={`${d.date}: ${d.units} ед`}>
            <div className="daybar-col">
              <span className="daybar-val">{d.units > 0 ? d.units : ''}</span>
              <div className="daybar-fill" style={{ ['--h']: `${h}%` } as CSSProperties} />
            </div>
            <span className="daybar-x">{showLabel ? dd : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Горизонтальные бары; ширина растёт при попадании родителя в вьюпорт (.in). */
function BarList({ items, unit }: { items: SumBar[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.units))
  if (items.length === 0) return <div className="muted" style={{ fontSize: 13 }}>Нет данных за период.</div>
  return (
    <div className="bar-list">
      {items.map((it, idx) => (
        <div className="bar-row" key={it.label + idx}>
          <div className="bar-top">
            <span className="bar-label" title={it.label}>{it.label}</span>
            <span className="bar-val">{it.units}{unit ? ` ${unit}` : ''}{it.orders ? ` · ${it.orders} зак.` : ''}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ ['--w']: `${Math.round((it.units / max) * 100)}%` } as CSSProperties} />
          </div>
        </div>
      ))}
    </div>
  )
}
/** Плавный счётчик числа (0 → value) с ease-out; уважает reduced-motion. */
function CountUp({ value, duration = 800 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{n}</>
}
/** datetime-local ("2026-07-01T13:00") -> формат бэкенда "2026-07-01 13:00:00". */
/** Date → строка для input[type=datetime-local] ("YYYY-MM-DDTHH:MM"). */
function toDatetimeLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function toBackendDate(v: string) {
  if (!v) return ''
  const [date, time = '00:00'] = v.split('T')
  const t = time.length === 5 ? `${time}:00` : time
  return `${date} ${t}`
}
/** Ссылку на этикетку укорачиваем, остальное — как есть. */
function formatCell(col: string, value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return '—'
  const s = String(value)
  if (col === 'Ссылка на этикетку' && s.length > 40) return `${s.slice(0, 37)}…`
  return s
}

/* ---------- Иконки ---------- */
function IconChevron() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
function IconCalendar() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" /><line x1="8" y1="3" x2="8" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><line x1="16" y1="3" x2="16" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>) }
function IconChart({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4 20V4M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><rect x="7" y="12" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="12.5" y="8" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="18" y="14" width="3" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" /></svg>) }
function IconGrid() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>) }
function IconWarehouse({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M3 9l9-5 9 5v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>) }
function IconDoc({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><line x1="9" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="9" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>) }
function IconBack() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><polyline points="11,6 5,12 11,18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
function IconSearch() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: .5 }}><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" /><line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>) }
function IconBell() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 10-12 0v5l-2 3h16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>) }
function IconLogout() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
