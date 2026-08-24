import { useState } from 'react'
import { useAuth } from '../auth'
import { navigate } from '../router'
import { isRemote } from '../config'
import { requestPasswordReset } from '../remote'
import { Field } from '../ui'

/** Вход в админку по логину и паролю + восстановление пароля по почте. */
export function LoginScreen({ notice }: { notice?: string }) {
  const { login } = useAuth()
  const [mode, setMode] = useState<'login' | 'recover'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoverSent, setRecoverSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await login(username, password)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Ошибка входа')
  }

  const recover = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isRemote()) {
      setError('Восстановление доступно только на боевом сервере.')
      return
    }
    setBusy(true)
    try {
      await requestPasswordReset(username)
      setRecoverSent(true)
    } catch {
      // Ответ намеренно одинаковый — показываем подтверждение в любом случае.
      setRecoverSent(true)
    } finally {
      setBusy(false)
    }
  }

  const toLogin = () => {
    setMode('login')
    setError(null)
    setRecoverSent(false)
    setPassword('')
  }

  if (mode === 'recover') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={recover}>
          <div className="auth-logo">🔑</div>
          <h1>Восстановление пароля</h1>
          {recoverSent ? (
            <>
              <p className="muted">
                Если такой логин существует и к нему привязана почта, мы отправили на неё новый пароль.
                Проверьте входящие (и папку «Спам»).
              </p>
              <button type="button" className="btn btn-primary btn-block" onClick={toLogin}>
                Вернуться ко входу
              </button>
            </>
          ) : (
            <>
              <p className="muted">Введите логин — новый пароль придёт на привязанную к нему почту.</p>
              <Field label="Логин">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              {error && <div className="auth-error">{error}</div>}
              <button className="btn btn-primary btn-block" disabled={busy || !username.trim()}>
                {busy ? 'Отправляем…' : 'Прислать новый пароль'}
              </button>
              <button type="button" className="linkbtn center" onClick={toLogin}>
                ← Назад ко входу
              </button>
            </>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">💆</div>
        <h1>Вход в админку</h1>
        <p className="muted">Введите выданные вам логин и пароль.</p>
        {notice && <div className="auth-notice">{notice}</div>}
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
        <div className="auth-links">
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setMode('recover')
              setError(null)
            }}
          >
            Забыли пароль?
          </button>
          <button type="button" className="linkbtn" onClick={() => navigate('/')}>
            ← К странице записи
          </button>
        </div>
      </form>
    </div>
  )
}
