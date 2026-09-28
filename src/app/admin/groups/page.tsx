'use client'

import { useEffect, useState } from 'react'

interface Client {
  id: string
  name: string
}
interface Group {
  id: string
  name: string
  members: { id: string; name: string }[]
}

export default function GroupsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const [gc, cc] = await Promise.all([
        fetch('/api/admin/groups', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/clients', { cache: 'no-store' }).then((r) => r.json())
      ])
      if (gc.ok) setGroups(gc.groups)
      if (cc.ok) setClients(cc.clients)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function addGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const r = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const d = await r.json()
    if (d.ok) {
      setName('')
      load()
    } else setError(d.error)
  }

  async function toggleMember(group: Group, clientId: string) {
    const has = group.members.some((m) => m.id === clientId)
    const ids = has
      ? group.members.filter((m) => m.id !== clientId).map((m) => m.id)
      : [...group.members.map((m) => m.id), clientId]
    const r = await fetch(`/api/admin/groups/${group.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: ids })
    })
    const d = await r.json()
    if (d.ok) load()
    else setError(d.error)
  }

  async function removeGroup(id: string) {
    const r = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.ok) load()
    else setError(d.error)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>
      <a className="open-link" href="/admin/clients">
        ← К клиентам
      </a>
      <h1 style={{ margin: '10px 0 16px', fontSize: 26 }}>Группы клиентов</h1>
      <p style={{ color: 'rgba(22,24,27,.55)', marginTop: -8 }}>
        Объединяют кабинеты в один лист сборки/отгрузку (отгрузка с одного склада).
      </p>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <form onSubmit={addGroup} className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Название группы"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <button className="btn" type="submit">
            Добавить группу
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map((g) => (
          <div key={g.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{g.name}</h3>
              <button
                className="preset"
                onClick={() => removeGroup(g.id)}
                style={{ color: '#c0392b' }}
              >
                Удалить
              </button>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {clients.length === 0 && (
                <span style={{ color: 'rgba(22,24,27,.5)', fontSize: 13 }}>Нет клиентов.</span>
              )}
              {clients.map((c) => {
                const on = g.members.some((m) => m.id === c.id)
                return (
                  <button
                    key={c.id}
                    className="preset"
                    onClick={() => toggleMember(g, c.id)}
                    style={on ? { background: 'var(--wine)', color: '#fff' } : undefined}
                  >
                    {on ? '✓ ' : ''}
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p style={{ color: 'rgba(22,24,27,.5)' }}>Пока нет групп.</p>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,.12)',
  padding: '0 14px',
  fontSize: 14,
  outline: 'none',
  flex: 1
}
