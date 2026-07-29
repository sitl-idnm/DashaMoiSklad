'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
      // Полная перезагрузка, чтобы middleware увидел свежую cookie.
      window.location.href = '/'
    } catch (e: any) {
      setErr(String(e?.message || e))
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="login-title">Панель инструментов</span>
          <span className="login-sub">City Group · внутренний доступ</span>
        </div>

        <label className="login-field">
          <span>Логин</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>

        <label className="login-field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {err && <div className="error">{err}</div>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? <><span className="spinner" />Вхожу…</> : 'Войти'}
        </button>
      </form>
    </div>
  )
}
