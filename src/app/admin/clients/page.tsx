'use client'

import { useEffect, useState } from 'react'

type Scope = 'content' | 'marketplace' | 'prices' | 'statistics'
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'content', label: 'Контент' },
  { key: 'marketplace', label: 'Маркетплейс' },
  { key: 'prices', label: 'Цены и скидки' },
  { key: 'statistics', label: 'Статистика' }
]

interface Credential {
  scope: Scope
  token_last4: string
  valid: boolean | null
  checked_at: string | null
}
interface Client {
  id: string
  name: string
  inn: string | null
  moysklad_org_id: string | null
  writes_enabled: Partial<Record<string, boolean>>
  created_at: string
}

interface MsOrg {
  id: string
  name: string
  inn: string | null
}

export default function ClientsAdminPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [orgs, setOrgs] = useState<MsOrg[]>([])
  const [orgsError, setOrgsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [inn, setInn] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/admin/clients', { cache: 'no-store' })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error || 'Ошибка загрузки')
      setClients(d.clients)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }
  async function loadOrgs() {
    try {
      const r = await fetch('/api/admin/moysklad/organizations', { cache: 'no-store' })
      const d = await r.json()
      if (d.ok) setOrgs(d.organizations)
      else setOrgsError(d.error || 'Не удалось получить организации')
    } catch (e: any) {
      setOrgsError(String(e?.message || e))
    }
  }
  useEffect(() => {
    load()
    loadOrgs()
  }, [])

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    try {
      const r = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, inn })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setName('')
      setInn('')
      await load()
      setOpenId(d.client.id)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 20px' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        <span className="badge">К</span> Админ · Клиенты (кабинеты ВБ)
      </div>
      <h1 style={{ margin: '0 0 18px', fontSize: 26 }}>Клиенты</h1>

      {error && (
        <div className="error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={addClient} className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Новый клиент</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="ИНН (необязательно)"
            value={inn}
            onChange={(e) => setInn(e.target.value)}
            style={inputStyle}
          />
          <button className="btn" type="submit">
            Добавить
          </button>
        </div>
      </form>

      {loading ? (
        <p style={{ color: 'rgba(22,24,27,.5)' }}>Загрузка…</p>
      ) : clients.length === 0 ? (
        <p style={{ color: 'rgba(22,24,27,.5)' }}>Пока нет клиентов.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              orgs={orgs}
              orgsError={orgsError}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ClientCard({
  client,
  orgs,
  orgsError,
  open,
  onToggle,
  onChanged
}: {
  client: Client
  orgs: MsOrg[]
  orgsError: string
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const [creds, setCreds] = useState<Credential[]>([])
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [genToken, setGenToken] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [runs, setRuns] = useState<any[]>([])

  // Один ключ на все категории (обычный случай: токен ВБ уже содержит нужные scope).
  async function saveGeneral() {
    const token = genToken.trim()
    if (!token) return
    setBusy('all')
    setMsg('')
    try {
      const r = await fetch(`/api/admin/clients/${client.id}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', token })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setCreds(d.credentials)
      setGenToken('')
      await verify()
    } catch (e: any) {
      setMsg(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  async function saveOrg(orgId: string) {
    setBusy('org')
    setMsg('')
    try {
      const r = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moysklad_org_id: orgId || null })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      onChanged()
    } catch (e: any) {
      setMsg(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  async function loadCreds() {
    const r = await fetch(`/api/admin/clients/${client.id}/credentials`, { cache: 'no-store' })
    const d = await r.json()
    if (d.ok) setCreds(d.credentials)
  }
  async function loadRuns() {
    const r = await fetch(`/api/admin/clients/${client.id}/runs`, { cache: 'no-store' })
    const d = await r.json()
    if (d.ok) setRuns(d.runs)
  }
  useEffect(() => {
    if (open) {
      loadCreds()
      loadRuns()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function sync(entity: string) {
    setBusy(`sync:${entity}`)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/clients/${client.id}/sync/${entity}`, { method: 'POST' })
      const d = await r.json()
      if (!d.ok && d.error) throw new Error(d.error)
      await loadRuns()
    } catch (e: any) {
      setMsg(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  async function saveToken(scope: Scope) {
    const token = (tokens[scope] || '').trim()
    if (!token) return
    setBusy(scope)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/clients/${client.id}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, token })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setCreds(d.credentials)
      setTokens((t) => ({ ...t, [scope]: '' }))
    } catch (e: any) {
      setMsg(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  async function verify() {
    setBusy('verify')
    setMsg('')
    try {
      const r = await fetch(`/api/admin/clients/${client.id}/verify-keys`, { method: 'POST' })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setCreds(d.credentials)
    } catch (e: any) {
      setMsg(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  const credByScope = (s: Scope) => creds.find((c) => c.scope === s)

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div>
          <h3 style={{ margin: 0 }}>{client.name}</h3>
          <p style={{ fontSize: 13, color: 'rgba(22,24,27,.55)', margin: '4px 0 0' }}>
            {client.inn ? `ИНН ${client.inn} · ` : ''}
            {creds.length || '—'} ключей
          </p>
        </div>
        <span className="open-link">{open ? 'Свернуть' : 'Открыть'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,.06)', paddingTop: 16 }}>
          {msg && (
            <div className="error" style={{ marginBottom: 12 }}>
              {msg}
            </div>
          )}

          {/* Привязка к организации МойСклада — по ней «Лист сборки» находит
              marketplace-ключ клиента и тянет «Стикер» прямо из кабинета ВБ. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ width: 130, fontWeight: 600, fontSize: 14 }}>Организация МС</div>
            <select
              value={client.moysklad_org_id || ''}
              disabled={busy === 'org' || orgs.length === 0}
              onChange={(e) => saveOrg(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 240 }}
            >
              <option value="">— не привязана (стикер по старому: PDF MPsklad) —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.inn ? ` · ИНН ${o.inn}` : ''}
                </option>
              ))}
            </select>
            {busy === 'org' && <span style={{ fontSize: 13, color: 'rgba(22,24,27,.5)' }}>Сохраняю…</span>}
          </div>
          {orgsError && (
            <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}>
              Организации МойСклада недоступны: {orgsError}
            </div>
          )}

          {/* Обычный случай: один ключ ВБ на все категории (scope зашиты в токене). */}
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Ключ ВБ</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <input
              type="password"
              placeholder="Вставьте API-ключ кабинета (один на все категории)"
              value={genToken}
              onChange={(e) => setGenToken(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 260 }}
            />
            <button className="btn" disabled={busy === 'all' || !genToken.trim()} onClick={saveGeneral}>
              {busy === 'all' ? 'Сохраняю…' : 'Сохранить и проверить'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: 'rgba(22,24,27,.5)' }}>Покрытие категорий:</span>
            {SCOPES.map(({ key, label }) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <StatusDot cr={credByScope(key)} />
                <span style={{ color: 'rgba(22,24,27,.6)' }}>{label}</span>
              </span>
            ))}
          </div>

          <details style={{ marginBottom: 4 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'rgba(22,24,27,.55)' }}>
              Дополнительно: отдельные ключи по категориям
            </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {SCOPES.map(({ key, label }) => {
              const cr = credByScope(key)
              return (
                <div
                  key={key}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <div style={{ width: 130, fontWeight: 600, fontSize: 14 }}>{label}</div>
                  <StatusDot cr={cr} />
                  <input
                    type="password"
                    placeholder={cr ? `••••${cr.token_last4} — заменить` : 'Вставьте токен'}
                    value={tokens[key] || ''}
                    onChange={(e) => setTokens((t) => ({ ...t, [key]: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                  />
                  <button
                    className="btn"
                    disabled={busy === key || !(tokens[key] || '').trim()}
                    onClick={() => saveToken(key)}
                  >
                    Сохранить
                  </button>
                </div>
              )
            })}
          </div>
          </details>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <button className="btn" disabled={busy === 'verify'} onClick={verify}>
              {busy === 'verify' ? 'Проверяю…' : 'Проверить ключи'}
            </button>
            <span style={{ fontSize: 13, color: 'rgba(22,24,27,.5)' }}>
              Запись в МойСклад отключена (dry-run).
            </span>
          </div>

          {/* Синхронизация из ВБ в нашу модель (без записи в МойСклад) */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
              Синхронизация из ВБ
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { k: 'products', l: 'Товары' },
                { k: 'orders', l: 'Заказы' },
                { k: 'prices', l: 'Цены' },
                { k: 'stock', l: 'Остатки' },
                { k: 'all', l: 'Всё' }
              ].map(({ k, l }) => (
                <button
                  key={k}
                  className="preset"
                  disabled={busy.startsWith('sync')}
                  onClick={() => sync(k)}
                >
                  {busy === `sync:${k}` ? '…' : l}
                </button>
              ))}
              <a className="open-link" href={`/admin/clients/${client.id}/diff`}>
                Сверка с МойСклад →
              </a>
            </div>

            {runs.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                {runs.slice(0, 8).map((r) => (
                  <div
                    key={r.id || r.started_at}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '4px 0',
                      color: r.status === 'error' ? '#c0392b' : 'rgba(22,24,27,.7)'
                    }}
                  >
                    <span style={{ width: 80, fontWeight: 600 }}>{r.entity}</span>
                    <span style={{ width: 60 }}>{r.status}</span>
                    <span style={{ flex: 1 }}>
                      {r.status === 'error'
                        ? r.error
                        : `+${r.stats?.created ?? 0} / ~${r.stats?.updated ?? 0} (всего ${r.stats?.total ?? 0})`}
                    </span>
                    <span style={{ color: 'rgba(22,24,27,.4)' }}>
                      {String(r.started_at).slice(5, 16).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({ cr }: { cr?: Credential }) {
  let color = '#c9ccd1' // не задан
  let title = 'Не задан'
  if (cr) {
    if (cr.valid === true) {
      color = '#2e9e5b'
      title = 'Валиден'
    } else if (cr.valid === false) {
      color = '#c0392b'
      title = 'Невалиден'
    } else {
      color = '#e0a300'
      title = 'Не проверен'
    }
  }
  return (
    <span
      title={title}
      style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  )
}

const inputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,.12)',
  padding: '0 14px',
  fontSize: 14,
  outline: 'none',
  minWidth: 180
}
