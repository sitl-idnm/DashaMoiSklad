'use client'

import { Fragment, useEffect, useState } from 'react'

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

// Колонки внутренней (раскрывающейся) таблицы — порядок как в XLSX, без фото.
const DATA_COLS = [
  'Ячейка', 'Товар', 'Артикул', 'Штрихкод', 'Кол-во',
  'Клиент', '№ заказа', 'Ссылка на этикетку', 'Дата заказа'
] as const

const CATS = { all: 'Все инструменты', sklad: 'Мой склад', reports: 'Отчёты' } as const
type Cat = keyof typeof CATS

export default function Panel() {
  const [cat, setCat] = useState<Cat>('all')
  const [view, setView] = useState<'dashboard' | 'tool'>('dashboard')
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

  async function loadSheets() {
    setLoading(true)
    setErr('')
    try {
      const r = await fetch('/api/sheets', { cache: 'no-store' })
      const d = await r.json()
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
      const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
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
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: toBackendDate(rangeStart),
          end: toBackendDate(rangeEnd),
          downloadImages: rangeImages,
          manual: true
        })
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setTab('manual')
      await loadSheets()
    } catch (e: any) {
      setErr('Ошибка генерации за период: ' + String(e?.message || e))
    } finally {
      setGenR(false)
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const openTool = () => setView('tool')
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
              <div className="range-row">
                <label className="range-field">
                  <span>Начало</span>
                  <input type="datetime-local" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                </label>
                <label className="range-field">
                  <span>Конец</span>
                  <input type="datetime-local" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </label>
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
              <div className="stat"><div className="num">{visible.length}</div><div className="cap">{tab === 'auto' ? 'дней с отгрузками' : 'ручных отчётов'}</div></div>
              <div className="stat"><div className="num">{inTab[0]?.demands ?? 0}</div><div className="cap">отгрузок (последний)</div></div>
              <div className="stat"><div className="num">{total}</div><div className="cap">строк всего</div></div>
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

            <div className="table-wrap">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th></th><th>дата / окно суток</th><th>отгрузок</th><th>позиций</th><th>строк</th><th>создан</th><th>скачать</th></tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={7} className="muted">Загрузка…</td></tr>}
                    {!loading && visible.length === 0 && (
                      <tr><td colSpan={7} className="muted">
                        {tab === 'manual'
                          ? 'Ручных отчётов пока нет. Соберите за период выше.'
                          : inTab.length === 0
                            ? 'Пока нет готовых листов. Нажмите «Сформировать сейчас» или дождитесь ежедневного запуска.'
                            : 'За этот период дней с отгрузками нет. Включите «показывать пустые», чтобы увидеть все сутки.'}
                      </td></tr>
                    )}
                    {visible.map((s) => {
                      const open = expanded.has(s.id)
                      return (
                        <Fragment key={s.id}>
                          <tr className={open ? 'row-open' : ''}>
                            <td>
                              <button
                                className={`chevron ${open ? 'up' : ''}`}
                                onClick={() => toggle(s.id)}
                                aria-label={open ? 'Свернуть' : 'Развернуть'}
                                title={open ? 'Свернуть' : 'Показать таблицу'}
                              >
                                <IconChevron />
                              </button>
                            </td>
                            <td>
                              <div className="row-date">
                                <DateBadge iso={s.window_end} />
                                <span className="win-range">
                                  <span className="win-main">{fmtDay(s.window_end)}</span>
                                  <span className="win-sub">{fmtWin(s.window_start)} → {fmtWin(s.window_end)}</span>
                                </span>
                              </div>
                            </td>
                            <td>{s.demands}</td>
                            <td>{s.positions}</td>
                            <td>{s.rows}</td>
                            <td className="muted">{fmtDt(s.created_at)}</td>
                            <td>{s.url ? <a className="dl" href={s.url}>скачать ↓</a> : <span className="muted">—</span>}</td>
                          </tr>
                          {open && (
                            <tr className="detail-row">
                              <td colSpan={7}>
                                {s.data && s.data.length > 0 ? (
                                  <div className="detail-scroll">
                                    <table className="detail-table">
                                      <thead>
                                        <tr>{DATA_COLS.map((c) => <th key={c}>{c}</th>)}</tr>
                                      </thead>
                                      <tbody>
                                        {s.data.map((row, i) => (
                                          <tr key={i}>
                                            {DATA_COLS.map((c) => <td key={c}>{formatCell(c, row[c])}</td>)}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="muted" style={{ padding: '4px 2px' }}>Данных по строкам нет (пустое окно или лист собран старой версией).</div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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
/** datetime-local ("2026-07-01T13:00") -> формат бэкенда "2026-07-01 13:00:00". */
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
function IconGrid() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>) }
function IconWarehouse({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M3 9l9-5 9 5v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>) }
function IconDoc({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><line x1="9" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="9" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>) }
function IconBack() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><polyline points="11,6 5,12 11,18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
function IconSearch() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: .5 }}><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" /><line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>) }
function IconBell() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 10-12 0v5l-2 3h16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>) }
function IconLogout() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
