// Авторизация админки. Работает в двух режимах:
//  - локальный (localStorage): учётки и проверка пароля в браузере;
//  - remote (Cloudflare Worker): вход идёт на сервер, данные приватны.
// Регистрации НЕТ. Суперадминистратор заводится вручную (worker/seed-owner.mjs),
// сотрудников (админов/мастеров) создаёт owner внутри панели.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { addUser, getState, updateUser, useDB, uid } from './db'
import { hashPassword, randomSalt, verifyPassword } from './crypto'
import { isRemote } from './config'
import * as remote from './remote'
import type { Role, User } from './types'

const SESSION_KEY = 'booking-session-user'

interface AuthContextValue {
  user: User | null
  /** Готовность контекста авторизации. */
  ready: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  /** owner создаёт админа/мастера. Возвращает созданного пользователя. */
  createStaff: (input: {
    role: Exclude<Role, 'owner'>
    username: string
    password: string
    name: string
    email?: string
    specialistId?: string
  }) => Promise<{ ok: boolean; error?: string; user?: User }>
  /** Сменить пароль пользователя. */
  setPassword: (userId: string, password: string) => Promise<void>
  /** Только owner управляет пользователями. */
  canManageUsers: boolean
  /** Только owner может что-либо менять; сотрудники — просмотр. */
  canManage: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** RemoteUser → минимальный User (без секретов) для нужд UI. */
function toUser(r: remote.RemoteUser): User {
  return { id: r.id, role: r.role, username: '', salt: '', passwordHash: '', name: r.name, specialistId: r.specialistId, createdAt: 0 }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDB()
  const remoteMode = isRemote()

  // Локальный режим
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY))
  // Remote-режим
  const [remoteUser, setRemoteUser] = useState<User | null>(() => {
    if (!remoteMode) return null
    const s = remote.getSession()
    return s ? toUser(s.user) : null
  })
  const ready = true // регистрации/проверки статуса нет — контекст готов сразу

  const localUser = useMemo(() => db.users.find((u) => u.id === sessionId) ?? null, [db.users, sessionId])

  const user = remoteMode ? remoteUser : localUser

  const login = useCallback(
    async (username: string, password: string) => {
      if (remoteMode) {
        try {
          const u = await remote.login(username, password)
          setRemoteUser(toUser(u))
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Ошибка входа' }
        }
      }
      const u = getState().users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
      if (!u || !(await verifyPassword(password, u.salt, u.passwordHash)))
        return { ok: false, error: 'Неверный логин или пароль' }
      localStorage.setItem(SESSION_KEY, u.id)
      setSessionId(u.id)
      return { ok: true }
    },
    [remoteMode],
  )

  const logout = useCallback(() => {
    if (remoteMode) {
      remote.logout()
      setRemoteUser(null)
      return
    }
    localStorage.removeItem(SESSION_KEY)
    setSessionId(null)
  }, [remoteMode])

  const createStaff = useCallback<AuthContextValue['createStaff']>(async ({ role, username, password, name, email, specialistId }) => {
    if (!username.trim() || !password) return { ok: false, error: 'Заполните логин и пароль' }
    const taken = getState().users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())
    if (taken) return { ok: false, error: 'Такой логин уже занят' }
    const salt = randomSalt()
    const u: User = {
      id: uid(),
      role,
      username: username.trim(),
      salt,
      passwordHash: await hashPassword(password, salt),
      name: name.trim() || username.trim(),
      email: email?.trim() || undefined,
      specialistId,
      createdAt: Date.now(),
    }
    // Мутация store → persist отправит на сервер (remote) либо в localStorage.
    addUser(u)
    return { ok: true, user: u }
  }, [])

  const setPassword = useCallback(async (userId: string, password: string) => {
    const salt = randomSalt()
    const passwordHash = await hashPassword(password, salt)
    updateUser(userId, { salt, passwordHash })
  }, [])

  const value: AuthContextValue = {
    user,
    ready,
    login,
    logout,
    createStaff,
    setPassword,
    canManageUsers: user?.role === 'owner',
    canManage: user?.role === 'owner',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Суперадминистратор' : 'Сотрудник'
}
