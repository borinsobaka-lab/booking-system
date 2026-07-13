// Слой данных. Пока всё хранится локально в браузере (localStorage) — это
// «симуляция» бэкенда: приложение полностью работает и демонстрируется без
// сервера. Позже адаптер можно заменить на настоящий бэкенд, не трогая UI.

import { useSyncExternalStore } from 'react'
import { isRemote } from './config'
import { toLoc } from './localized'
import type { Booking, Brand, DaySchedule, DB, Service, Specialist, User } from './types'

const STORAGE_KEY = 'booking-db-v1'

// Демо-суперадминистратор ТОЛЬКО для локального режима (без сервера) — чтобы
// разработку/демо можно было открыть без экрана регистрации. В боевом
// (remote) режиме владелец заводится вручную в приватном репозитории
// (worker/seed-owner.mjs) и сюда не попадает. Логин/пароль: demo / demo.
const DEMO_OWNER: User = {
  id: 'demo-owner',
  role: 'owner',
  username: 'demo',
  salt: '5945b2946ed52b7f8be90ab45e03cbaf',
  passwordHash: '2c60d90e9599003aa24dd670643ea616b1ffa98c7f19e5a0c1d6a74d46574b4b',
  name: 'Демо-администратор',
  createdAt: 0,
}

function emptyBrand(): Brand {
  return {
    name: { en: 'Massage studio', ka: 'მასაჟის სტუდია', ru: 'Массаж-студия' },
    address: { en: '', ka: '', ru: '' },
    avatar: null,
    banner: null,
  }
}

/** Миграция контента к LocalizedString (старые данные были обычными строками). */
function migrateContent(db: DB): DB {
  db.brand = { ...db.brand, name: toLoc(db.brand.name), address: toLoc(db.brand.address) }
  db.services = db.services.map((s) => ({ ...s, name: toLoc(s.name), description: toLoc(s.description) }))
  db.specialists = db.specialists.map((sp) => ({
    ...sp,
    firstName: toLoc(sp.firstName),
    lastName: toLoc(sp.lastName),
    role: toLoc(sp.role),
  }))
  return db
}

function emptyDB(): DB {
  return {
    version: 1,
    users: [],
    brand: emptyBrand(),
    services: [],
    specialists: [],
    schedules: [],
    bookings: [],
  }
}

/** Генерация id без внешних зависимостей. */
export function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  )
}

// --- Хранилище ---

let state: DB = load()
const listeners = new Set<() => void>()

function load(): DB {
  // В remote-режиме данные приходят с сервера (hydrate) — локально ничего не сеем.
  if (isRemote()) return emptyDB()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return withDemoOwner(emptyDB())
    const parsed = JSON.parse(raw) as DB
    // Мягкая миграция: дозаполняем отсутствующие поля + контент → LocalizedString.
    return withDemoOwner(migrateContent({ ...emptyDB(), ...parsed, brand: { ...emptyBrand(), ...parsed.brand } }))
  } catch {
    return withDemoOwner(emptyDB())
  }
}

/** Локальный режим: гарантируем наличие демо-владельца (без экрана регистрации). */
function withDemoOwner(db: DB): DB {
  if (!db.users.some((u) => u.role === 'owner')) db.users = [DEMO_OWNER, ...db.users]
  return db
}

function localPersist(db: DB) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Хранилище переполнено/недоступно — тихо игнорируем в демо-режиме.
  }
}

// Стратегия сохранения. По умолчанию — localStorage (локальный режим).
// В remote-режиме заменяется: у витрины — no-op, у админки — отправка на Worker.
let persister: ((db: DB) => void) | null = localPersist

/** Задать стратегию сохранения (remote-режим). null ⇒ ничего не сохраняем. */
export function setPersister(fn: ((db: DB) => void) | null): void {
  persister = fn
}

function persist() {
  persister?.(state)
}

function emit() {
  for (const l of listeners) l()
}

/** Заменить всё состояние извне (загрузка с сервера). Не пишет обратно. */
export function hydrate(next: DB): void {
  state = migrateContent({ ...emptyDB(), ...next, brand: { ...emptyBrand(), ...next.brand } })
  emit()
}

/** Применить изменение к состоянию (иммутабельно) и сохранить. */
export function mutate(fn: (draft: DB) => DB | void): void {
  const draft = structuredClone(state)
  const next = fn(draft)
  // Мутаторы могут либо вернуть новое состояние, либо править переданный draft
  // на месте (тогда fn возвращает void и мы сохраняем именно draft).
  state = (next ?? draft) as DB
  persist()
  emit()
}

export function getState(): DB {
  return state
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Реактивный доступ ко всей базе. */
export function useDB(): DB {
  return useSyncExternalStore(subscribe, getState, getState)
}

// Кросс-вкладочная синхронизация: другая вкладка изменила данные.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      state = load()
      emit()
    }
  })
}

// --- Мутации: пользователи ---

export function hasOwner(): boolean {
  return state.users.some((u) => u.role === 'owner')
}

export function addUser(u: User): void {
  mutate((db) => {
    db.users.push(u)
  })
}

export function updateUser(id: string, patch: Partial<User>): void {
  mutate((db) => {
    const u = db.users.find((x) => x.id === id)
    if (u) Object.assign(u, patch)
  })
}

export function deleteUser(id: string): void {
  mutate((db) => {
    db.users = db.users.filter((u) => u.id !== id)
  })
}

// --- Мутации: бренд ---

export function updateBrand(patch: Partial<Brand>): void {
  mutate((db) => {
    db.brand = { ...db.brand, ...patch }
  })
}

// --- Мутации: услуги ---

export function saveService(s: Service): void {
  mutate((db) => {
    const i = db.services.findIndex((x) => x.id === s.id)
    if (i >= 0) db.services[i] = s
    else db.services.push(s)
  })
}

export function deleteService(id: string): void {
  mutate((db) => {
    db.services = db.services.filter((s) => s.id !== id)
    // Убираем услугу из специалистов и отменяем связанные записи.
    for (const sp of db.specialists) sp.serviceIds = sp.serviceIds.filter((x) => x !== id)
    db.bookings = db.bookings.filter((b) => b.serviceId !== id)
  })
}

// --- Мутации: специалисты ---

export function saveSpecialist(s: Specialist): void {
  mutate((db) => {
    const i = db.specialists.findIndex((x) => x.id === s.id)
    if (i >= 0) db.specialists[i] = s
    else db.specialists.push(s)
  })
}

export function deleteSpecialist(id: string): void {
  mutate((db) => {
    db.specialists = db.specialists.filter((s) => s.id !== id)
    db.schedules = db.schedules.filter((s) => s.specialistId !== id)
    db.bookings = db.bookings.filter((b) => b.specialistId !== id)
    // Отвязываем от пользователей-мастеров.
    for (const u of db.users) if (u.specialistId === id) u.specialistId = undefined
  })
}

// --- Мутации: расписание ---

/** Записать расписание специалиста на день (перезаписывает окна/перерывы). */
export function setDaySchedule(sched: DaySchedule): void {
  mutate((db) => {
    db.schedules = db.schedules.filter(
      (s) => !(s.specialistId === sched.specialistId && s.date === sched.date),
    )
    // Пустой день (нет окон и перерывов) не храним — это просто выходной.
    if (sched.windows.length || sched.breaks.length) db.schedules.push(sched)
  })
}

export function getDaySchedule(specialistId: string, date: string): DaySchedule | undefined {
  return state.schedules.find((s) => s.specialistId === specialistId && s.date === date)
}

// --- Мутации: записи ---

export function addBooking(b: Booking): void {
  mutate((db) => {
    db.bookings.push(b)
  })
}

export function deleteBooking(id: string): void {
  mutate((db) => {
    db.bookings = db.bookings.filter((b) => b.id !== id)
  })
}

/** Полный сброс (для отладки/демо). */
export function resetDB(): void {
  state = emptyDB()
  persist()
  emit()
}
