'use client'

import { useEffect, useState } from 'react'

interface Sheet {
  id: number
  filename: string
  window_start: string
  window_end: string
  demands: number
  positions: number
  rows: number
  created_at: string
  url: string | null
}
interface Win {
  startStr: string
  endStr: string
}

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

  const openTool = () => setView('tool')
  const back = () => setView('dashboard')
  const total = sheets.reduce((a, s) => a + (s.rows || 0), 0)

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
          <div style={{ minWidth: 0 }}>
            <div className="name">City Group</div>
            <div className="role">оператор склада</div>
          </div>
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

            {!configured && (
              <div className="error">Supabase не настроен: задайте SUPABASE_URL и SUPABASE_ANON_KEY в переменных окружения.</div>
            )}
            {err && <div className="error">{err}</div>}

            <div className="stats">
              <div className="stat"><div className="num">{sheets.length}</div><div className="cap">готовых листов</div></div>
              <div className="stat"><div className="num">{sheets[0]?.demands ?? 0}</div><div className="cap">отгрузок (последний)</div></div>
              <div className="stat"><div className="num">{total}</div><div className="cap">строк всего</div></div>
              <div className="stat dark"><div className="num">13:00</div><div className="cap">граница суток</div></div>
            </div>

            <div className="table-wrap">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>окно суток</th><th>файл</th><th>отгрузок</th><th>позиций</th><th>строк</th><th>создан</th><th>скачать</th></tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={7} className="muted">Загрузка…</td></tr>}
                    {!loading && sheets.length === 0 && (
                      <tr><td colSpan={7} className="muted">Пока нет готовых листов. Нажмите «Сформировать сейчас» или дождитесь ежедневного запуска.</td></tr>
                    )}
                    {sheets.map((s) => (
                      <tr key={s.id}>
                        <td>{fmtWin(s.window_start)} → {fmtWin(s.window_end)}</td>
                        <td>{s.filename}</td>
                        <td>{s.demands}</td>
                        <td>{s.positions}</td>
                        <td>{s.rows}</td>
                        <td className="muted">{fmtDt(s.created_at)}</td>
                        <td>{s.url ? <a className="dl" href={s.url}>скачать ↓</a> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
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

/* ---------- Иконки ---------- */
function IconGrid() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" /></svg>) }
function IconWarehouse({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M3 9l9-5 9 5v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>) }
function IconDoc({ s = 18 }: { s?: number }) { return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><line x1="9" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="9" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>) }
function IconBack() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><polyline points="11,6 5,12 11,18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>) }
function IconSearch() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: .5 }}><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" /><line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>) }
function IconBell() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 10-12 0v5l-2 3h16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>) }
