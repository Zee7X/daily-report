'use client'

import { useState } from 'react'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'

export function LoginForm({ next, restricted }: { next: string; restricted: boolean }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ redirect: string }>(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', {
        method: 'POST',
        json: mode === 'login' ? { email, password, next } : { name, email, password, next },
      })
      window.location.assign(r.redirect)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <div className="seg" role="group" aria-label={t.login.label}>
        <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
          {t.login.tabLogin}
        </button>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
          {t.login.tabSignup}
        </button>
      </div>
      {mode === 'signup' && (
        <label className="field">
          <span>{t.login.name}</span>
          <input className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>{t.login.email}</span>
        <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.login.password}</span>
        <input
          className="input"
          type="password"
          required
          minLength={mode === 'signup' ? 10 : 1}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {mode === 'signup' && <p className="small">{t.login.passwordHint}{restricted ? ` ${t.login.signupNote}` : ''}</p>}
      {error && (
        <p className="notice bad" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'login' ? t.login.submitLogin : t.login.submitSignup} ↗
        </button>
      </div>
    </form>
  )
}
