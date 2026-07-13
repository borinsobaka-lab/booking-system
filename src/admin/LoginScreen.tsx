import { useState } from 'react'
import { useAuth } from '../auth'
import { navigate } from '../router'
import { Field } from '../ui'

/** Вход в админку по логину и паролю. */
export function LoginScreen() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await login(username, password)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Ошибка входа')
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">💆</div>
        <h1>Вход в админку</h1>
        <p className="muted">Введите выданные вам логин и пароль.</p>
        <Field label="Логин">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <button type="button" className="linkbtn center" onClick={() => navigate('/')}>
          ← К странице записи
        </button>
      </form>
    </div>
  )
}
