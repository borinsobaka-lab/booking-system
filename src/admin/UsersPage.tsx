import { useState } from 'react'
import { useDB, deleteUser } from '../db'
import { useAuth, roleLabel } from '../auth'
import { Avatar, Field, Modal } from '../ui'
import type { Role, User } from '../types'

export function UsersPage() {
  const db = useDB()
  const { user: me } = useAuth()
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<User | null>(null)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Пользователи</h1>
          <p className="muted small">
            Заводите админов и мастеров, выдавайте им логины и пароли. Раздел доступен только вам.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Добавить пользователя
        </button>
      </header>

      <div className="user-list">
        {db.users.map((u) => {
          const spec = u.specialistId ? db.specialists.find((s) => s.id === u.specialistId) : null
          return (
            <div className="user-row" key={u.id}>
              <Avatar src={spec?.avatar ?? null} name={u.name} size={40} />
              <div className="user-row-main">
                <div className="user-row-name">
                  {u.name}
                  {u.id === me?.id && <span className="badge">это вы</span>}
                </div>
                <div className="user-row-sub">
                  @{u.username} · {roleLabel(u.role)}
                  {spec && ` · профиль: ${spec.firstName} ${spec.lastName}`}
                </div>
              </div>
              <div className="user-row-actions">
                {u.role !== 'owner' && (
                  <>
                    <button className="linkbtn" onClick={() => setResetting(u)}>
                      Сменить пароль
                    </button>
                    <button
                      className="linkbtn danger"
                      onClick={() => confirm(`Удалить пользователя «${u.name}»?`) && deleteUser(u.id)}
                    >
                      Удалить
                    </button>
                  </>
                )}
                {u.role === 'owner' && (
                  <button className="linkbtn" onClick={() => setResetting(u)}>
                    Сменить пароль
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {creating && <UserCreator onClose={() => setCreating(false)} />}
      {resetting && <PasswordResetter user={resetting} onClose={() => setResetting(null)} />}
    </div>
  )
}

function genPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  for (const n of arr) s += chars[n % chars.length]
  return s
}

function UserCreator({ onClose }: { onClose: () => void }) {
  const db = useDB()
  const { createStaff } = useAuth()
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('master')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState(genPassword())
  const [specialistId, setSpecialistId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ username: string; password: string; role: Role } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    const res = await createStaff({
      role,
      username,
      password,
      name,
      specialistId: role === 'master' && specialistId ? specialistId : undefined,
    })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Не удалось создать пользователя')
    setCreated({ username: username.trim(), password, role })
  }

  if (created) {
    return (
      <Modal title="Пользователь создан" onClose={onClose}>
        <div className="form">
          <p className="muted">
            Передайте эти данные сотруднику. Пароль показывается один раз — потом его можно только
            сменить.
          </p>
          <div className="cred-box">
            <div>
              <span className="muted small">Роль</span>
              <div>{roleLabel(created.role)}</div>
            </div>
            <div>
              <span className="muted small">Логин</span>
              <div className="cred-value">{created.username}</div>
            </div>
            <div>
              <span className="muted small">Пароль</span>
              <div className="cred-value">{created.password}</div>
            </div>
          </div>
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard?.writeText(`Логин: ${created.username}\nПароль: ${created.password}`)
            }
          >
            Скопировать логин и пароль
          </button>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Новый пользователь" onClose={onClose}>
      <div className="form">
        <Field label="Роль">
          <div className="segmented">
            <button className={role === 'master' ? 'active' : ''} onClick={() => setRole('master')}>
              Мастер
            </button>
            <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
              Администратор
            </button>
          </div>
        </Field>
        <p className="muted small">
          И мастера, и админы могут входить и видеть записи. Управлять пользователями может только
          суперадминистратор.
        </p>
        <Field label="Имя сотрудника">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Нино" />
        </Field>
        {role === 'master' && (
          <Field label="Профиль специалиста (необязательно)">
            <select value={specialistId} onChange={(e) => setSpecialistId(e.target.value)}>
              <option value="">— не привязывать —</option>
              {db.specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} · {s.role}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Логин">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="латиницей, без пробелов" />
        </Field>
        <Field label="Пароль">
          <div className="input-with-btn">
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-sm" type="button" onClick={() => setPassword(genPassword())}>
              Сгенерировать
            </button>
          </div>
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PasswordResetter({ user, onClose }: { user: User; onClose: () => void }) {
  const { setPassword } = useAuth()
  const [password, setPasswordValue] = useState(genPassword())
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    setBusy(true)
    await setPassword(user.id, password)
    setBusy(false)
    setDone(true)
  }

  return (
    <Modal title={`Пароль · ${user.name}`} onClose={onClose}>
      <div className="form">
        {done ? (
          <>
            <p className="muted">Новый пароль установлен. Передайте его сотруднику:</p>
            <div className="cred-box">
              <div>
                <span className="muted small">Логин</span>
                <div className="cred-value">{user.username}</div>
              </div>
              <div>
                <span className="muted small">Новый пароль</span>
                <div className="cred-value">{password}</div>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Готово
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label="Новый пароль">
              <div className="input-with-btn">
                <input value={password} onChange={(e) => setPasswordValue(e.target.value)} />
                <button className="btn btn-sm" type="button" onClick={() => setPasswordValue(genPassword())}>
                  Сгенерировать
                </button>
              </div>
            </Field>
            <div className="form-actions">
              <button className="btn" onClick={onClose}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={apply} disabled={busy || !password}>
                {busy ? 'Сохраняем…' : 'Установить пароль'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
