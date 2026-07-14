import { useState } from 'react'
import { useDB, deleteUser, updateUser } from '../db'
import { useAuth, roleLabel } from '../auth'
import { Avatar, Field, Modal } from '../ui'
import { pick, specialistName } from '../localized'
import type { Role, User } from '../types'

export function UsersPage() {
  const db = useDB()
  const { user: me } = useAuth()
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<User | null>(null)
  const [editingEmail, setEditingEmail] = useState<User | null>(null)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Пользователи</h1>
          <p className="muted small">
            Заводите сотрудников, выдавайте им логины и пароли. Раздел доступен только вам.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Сотрудник
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
                  {spec && ` · профиль: ${specialistName(spec, 'ru')}`}
                  {u.email && ` · ${u.email}`}
                </div>
              </div>
              <div className="user-row-actions">
                <button className="linkbtn" onClick={() => setEditingEmail(u)}>
                  Почта
                </button>
                <button className="linkbtn" onClick={() => setResetting(u)}>
                  Сменить пароль
                </button>
                {u.role !== 'owner' && (
                  <button
                    className="linkbtn danger"
                    onClick={() => confirm(`Удалить пользователя «${u.name}»?`) && deleteUser(u.id)}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {creating && <UserCreator onClose={() => setCreating(false)} />}
      {resetting && <PasswordResetter user={resetting} onClose={() => setResetting(null)} />}
      {editingEmail && <EmailEditor user={editingEmail} onClose={() => setEditingEmail(null)} />}
    </div>
  )
}

function EmailEditor({ user, onClose }: { user: User; onClose: () => void }) {
  const [email, setEmail] = useState(user.email ?? '')
  const valid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const save = () => {
    if (!valid) return
    updateUser(user.id, { email: email.trim() || undefined })
    onClose()
  }
  return (
    <Modal title={`Почта · ${user.name}`} onClose={onClose}>
      <div className="form">
        <p className="muted small">Для уведомлений (о новых записях и т.п.). Клиентам не показывается.</p>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        {!valid && <div className="auth-error">Проверьте адрес почты</div>}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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
      role: 'staff',
      username,
      password,
      name,
      email,
      specialistId: specialistId || undefined,
    })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Не удалось создать пользователя')
    setCreated({ username: username.trim(), password, role: 'staff' })
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
    <Modal title="Новый сотрудник" onClose={onClose}>
      <div className="form">
        <p className="muted small">
          Сотрудник может входить и просматривать записи и контент, но не может ничего менять —
          управляет всем только суперадминистратор.
        </p>
        <Field label="Имя сотрудника">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Нино" />
        </Field>
        <Field label="Email (для уведомлений, необязательно)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Профиль специалиста (если это мастер, необязательно)">
          <select value={specialistId} onChange={(e) => setSpecialistId(e.target.value)}>
            <option value="">— не привязывать —</option>
            {db.specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {specialistName(s, 'ru')} · {pick(s.role, 'ru')}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted small">
          Привяжите карточку специалиста — тогда на его email будут приходить уведомления о записях
          и отменах к этому мастеру.
        </p>
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
