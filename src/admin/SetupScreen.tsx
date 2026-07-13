import { useState } from 'react'
import { useAuth } from '../auth'
import { Field } from '../ui'

/** Первый запуск: создаём суперадминистратора (owner). */
export function SetupScreen() {
  const { createOwner } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== password2) return setError('Пароли не совпадают')
    setBusy(true)
    const res = await createOwner(username, password, name)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Не удалось создать администратора')
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">💆</div>
        <h1>Настройка администратора</h1>
        <p className="muted">
          Это первый запуск. Придумайте логин и пароль суперадминистратора — под ним вы
          управляете сотрудниками, услугами и расписанием.
        </p>
        <Field label="Ваше имя">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Гига" />
        </Field>
        <Field label="Логин">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Повторите пароль">
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать и войти'}
        </button>
      </form>
    </div>
  )
}
