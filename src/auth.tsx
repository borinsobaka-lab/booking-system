// Авторизация админки. Суперадминистратор (owner) создаётся при первом запуске.
// owner заводит админов и мастеров и выдаёт им логины/пароли. Управлять
// пользователями может только owner.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { addUser, getState, updateUser, useDB, uid } from './db'
import { hashPassword, randomSalt, verifyPassword } from './crypto'
import type { Role, User } from './types'

const SESSION_KEY = 'booking-session-user'

interface AuthContextValue {
  user: User | null
  /** Есть ли уже суперадминистратор (пройдена ли первичная настройка). */
  ownerExists: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  /** Создать суперадминистратора при первом запуске. */
  createOwner: (username: string, password: string, name: string) => Promise<{ ok: boolean; error?: string }>
  /** owner создаёт админа/мастера. Возвращает созданного пользователя. */
  createStaff: (input: {
    role: Exclude<Role, 'owner'>
    username: string
    password: string
    name: string
    specialistId?: string
  }) => Promise<{ ok: boolean; error?: string; user?: User }>
  /** Сменить пароль пользователя (owner — любому, себе — любой). */
  setPassword: (userId: string, password: string) => Promise<void>
  /** Только owner управляет пользователями. */
  canManageUsers: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDB()
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY))

  const user = useMemo(() => db.users.find((u) => u.id === sessionId) ?? null, [db.users, sessionId])
  const ownerExists = useMemo(() => db.users.some((u) => u.role === 'owner'), [db.users])

  const login = useCallback(async (username: string, password: string) => {
    const u = getState().users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
    if (!u) return { ok: false, error: 'Неверный логин или пароль' }
    const ok = await verifyPassword(password, u.salt, u.passwordHash)
    if (!ok) return { ok: false, error: 'Неверный логин или пароль' }
    sessionStorage.setItem(SESSION_KEY, u.id)
    setSessionId(u.id)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    setSessionId(null)
  }, [])

  const usernameTaken = (username: string) =>
    getState().users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())

  const createOwner = useCallback(async (username: string, password: string, name: string) => {
    if (getState().users.some((u) => u.role === 'owner')) return { ok: false, error: 'Суперадминистратор уже создан' }
    if (!username.trim() || !password) return { ok: false, error: 'Заполните логин и пароль' }
    const salt = randomSalt()
    const owner: User = {
      id: uid(),
      role: 'owner',
      username: username.trim(),
      salt,
      passwordHash: await hashPassword(password, salt),
      name: name.trim() || 'Администратор',
      createdAt: Date.now(),
    }
    addUser(owner)
    sessionStorage.setItem(SESSION_KEY, owner.id)
    setSessionId(owner.id)
    return { ok: true }
  }, [])

  const createStaff = useCallback<AuthContextValue['createStaff']>(
    async ({ role, username, password, name, specialistId }) => {
      if (!username.trim() || !password) return { ok: false, error: 'Заполните логин и пароль' }
      if (usernameTaken(username)) return { ok: false, error: 'Такой логин уже занят' }
      const salt = randomSalt()
      const u: User = {
        id: uid(),
        role,
        username: username.trim(),
        salt,
        passwordHash: await hashPassword(password, salt),
        name: name.trim() || username.trim(),
        specialistId,
        createdAt: Date.now(),
      }
      addUser(u)
      return { ok: true, user: u }
    },
    [],
  )

  const setPassword = useCallback(async (userId: string, password: string) => {
    const salt = randomSalt()
    const passwordHash = await hashPassword(password, salt)
    updateUser(userId, { salt, passwordHash })
  }, [])

  const value: AuthContextValue = {
    user,
    ownerExists,
    login,
    logout,
    createOwner,
    createStaff,
    setPassword,
    canManageUsers: user?.role === 'owner',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Суперадминистратор' : role === 'admin' ? 'Администратор' : 'Мастер'
}
