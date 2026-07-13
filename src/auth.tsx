// Авторизация админки. Работает в двух режимах:
//  - локальный (localStorage): учётки и проверка пароля в браузере;
//  - remote (Cloudflare Worker): вход/настройка идут на сервер, данные приватны.
// Суперадминистратор (owner) создаётся при первом запуске. owner заводит
// админов и мастеров; управлять пользователями может только owner.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addUser, getState, updateUser, useDB, uid } from './db'
import { hashPassword, randomSalt, verifyPassword } from './crypto'
import { isRemote } from './config'
import * as remote from './remote'
import type { Role, User } from './types'

const SESSION_KEY = 'booking-session-user'

interface AuthContextValue {
  user: User | null
  /** Есть ли уже суперадминистратор (пройдена ли первичная настройка). */
  ownerExists: boolean
  /** Готовность (в remote-режиме — после проверки статуса на сервере). */
  ready: boolean
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
  /** Сменить пароль пользователя. */
  setPassword: (userId: string, password: string) => Promise<void>
  /** Только owner управляет пользователями. */
  canManageUsers: boolean
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
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY))
  // Remote-режим
  const [remoteUser, setRemoteUser] = useState<User | null>(() => {
    if (!remoteMode) return null
    const s = remote.getSession()
    return s ? toUser(s.user) : null
  })
  const [remoteOwnerExists, setRemoteOwnerExists] = useState(false)
  const [ready, setReady] = useState(!remoteMode)

  useEffect(() => {
    if (!remoteMode) return
    let alive = true
    remote
      .fetchStatus()
      .then((s) => alive && setRemoteOwnerExists(s.hasOwner))
      .catch(() => {})
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [remoteMode])

  const localUser = useMemo(() => db.users.find((u) => u.id === sessionId) ?? null, [db.users, sessionId])
  const localOwnerExists = useMemo(() => db.users.some((u) => u.role === 'owner'), [db.users])

  const user = remoteMode ? remoteUser : localUser
  const ownerExists = remoteMode ? remoteOwnerExists : localOwnerExists

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
      sessionStorage.setItem(SESSION_KEY, u.id)
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
    sessionStorage.removeItem(SESSION_KEY)
    setSessionId(null)
  }, [remoteMode])

  const createOwner = useCallback(
    async (username: string, password: string, name: string) => {
      if (!username.trim() || !password) return { ok: false, error: 'Заполните логин и пароль' }
      if (remoteMode) {
        try {
          const u = await remote.setupOwner(username.trim(), password, name.trim())
          setRemoteUser(toUser(u))
          setRemoteOwnerExists(true)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Не удалось создать администратора' }
        }
      }
      if (getState().users.some((u) => u.role === 'owner')) return { ok: false, error: 'Суперадминистратор уже создан' }
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
    },
    [remoteMode],
  )

  const createStaff = useCallback<AuthContextValue['createStaff']>(async ({ role, username, password, name, specialistId }) => {
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
    ownerExists,
    ready,
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
