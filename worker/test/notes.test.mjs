import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/api.js'
import { emptyData, hashPassword, cancelToken, bookingNote, membershipNote } from '../src/logic.js'

// Подписи к коммитам в репозиторий данных = текст уведомлений (Telegram).
// Здесь проверяем и сами формулировки, и то, что обработчики их ставят.

const DATA = {
  specialists: [{ id: 'p1', firstName: { ru: 'Нино', en: 'Nino' }, lastName: { ru: 'Ц.', en: 'T.' } }],
  services: [{ id: 's1', name: { ru: 'Массаж', en: 'Massage' } }],
}
const BOOKING = {
  id: 'b1', specialistId: 'p1', serviceId: 's1', date: '2026-09-14', start: '10:00', end: '11:00',
  clientName: 'Ана Кикнадзе', clientPhone: '+995 555 12 34 56',
}

test('подпись о записи: клиент, мастер, когда и услуга', () => {
  assert.equal(
    bookingNote('new', DATA, BOOKING),
    'Новая запись: Ана Кикнадзе → Нино Ц. · 14 сентября, 10:00 · Массаж',
  )
  assert.equal(
    bookingNote('admin', DATA, BOOKING),
    'Новая запись (из админки): Ана Кикнадзе → Нино Ц. · 14 сентября, 10:00 · Массаж',
  )
  assert.equal(
    bookingNote('cancel', DATA, BOOKING),
    'Отмена записи: Ана Кикнадзе → Нино Ц. · 14 сентября, 10:00 · Массаж',
  )
  assert.equal(
    bookingNote('cancel-public', DATA, BOOKING),
    'Отмена записи (клиент сам): Ана Кикнадзе → Нино Ц. · 14 сентября, 10:00 · Массаж',
  )
})

test('подпись о записи: без имени клиента и с неизвестным мастером', () => {
  assert.equal(
    bookingNote('new', DATA, { ...BOOKING, clientName: '' }),
    'Новая запись: без имени → Нино Ц. · 14 сентября, 10:00 · Массаж',
  )
  assert.equal(
    bookingNote('new', { specialists: [], services: [] }, BOOKING),
    'Новая запись: Ана Кикнадзе → мастер не указан · 14 сентября, 10:00',
  )
})

test('подпись об абонементе: клиент и число посещений', () => {
  const m = { clientName: 'Ана', clientPhone: '+995 555 12 34 56', total: 8 }
  assert.equal(membershipNote('new', m), 'Новый абонемент: Ана · 8 посещений')
  assert.equal(membershipNote('update', { ...m, total: 2 }), 'Абонемент изменён: Ана · 2 посещения')
  assert.equal(membershipNote('new', { ...m, total: 1 }), 'Новый абонемент: Ана · 1 посещение')
  assert.equal(membershipNote('delete', m), 'Абонемент удалён: Ана')
  // Имени нет — подписываем телефоном, иначе непонятно, чей абонемент
  assert.equal(membershipNote('new', { ...m, clientName: '' }), 'Новый абонемент: +995 555 12 34 56 · 8 посещений')
})

// --- Через API: что реально уходит в подпись коммита ---

function makeStore(initial) {
  let data = initial
  const notes = []
  return {
    notes,
    async get() {
      return { data: structuredClone(data), sha: 'sha0' }
    },
    async update(mutator, message) {
      const cur = structuredClone(data)
      const next = mutator(cur)
      if (next === null) return { data: cur, sha: 'sha0', skipped: true }
      data = structuredClone(next)
      // Как в настоящем хранилище: подпись может быть функцией от результата.
      notes.push(typeof message === 'function' ? message(next) : message)
      return { data: next, sha: 'sha1' }
    },
    _peek: () => data,
  }
}

const ENV = { SESSION_SECRET: 'test-secret', CORS_ORIGIN: '*' }
let seq = 0
const deps = (store) => ({ store, now: () => 1_700_000_000_000, rnd: () => (seq = (seq + 0.17) % 1) })

async function call(store, method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const request = new Request(`https://api.test${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const res = await handle(request, ENV, deps(store))
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function seededStore() {
  const passwordHash = await hashPassword('pw', 's1')
  return makeStore({
    ...emptyData(),
    users: [{ id: 'o1', role: 'owner', username: 'owner', salt: 's1', passwordHash, name: 'Гига', createdAt: 1 }],
    services: [{ id: 's1', name: 'Массаж', description: '', durationMin: 60, price: 3000, image: null, createdAt: 1 }],
    specialists: [
      { id: 'p1', firstName: 'Нино', lastName: 'Ц.', role: 'Массажист', avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ],
    schedules: [{ specialistId: 'p1', date: '2026-07-13', windows: [{ start: '09:00', end: '18:00' }], breaks: [] }],
    bookings: [],
  })
}

const newBooking = {
  specialistId: 'p1',
  serviceId: 's1',
  date: '2026-07-13',
  start: '10:00',
  clientName: 'Ана Кикнадзе',
  clientPhone: '+995 555 12 34 56',
  consent: true,
}

test('запись с витрины подписывается клиентом и мастером', async () => {
  const store = await seededStore()
  const booked = await call(store, 'POST', '/api/bookings', { body: newBooking })
  assert.equal(booked.status, 200)
  assert.equal(store.notes.at(-1), 'Новая запись: Ана Кикнадзе → Нино Ц. · 13 июля, 10:00 · Массаж')
})

test('отмена из админки и отмена клиентом подписаны по-разному', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const token = login.body.token

  const first = await call(store, 'POST', '/api/bookings', { body: newBooking })
  await call(store, 'POST', '/api/bookings/cancel', { token, body: { id: first.body.booking.id } })
  assert.equal(store.notes.at(-1), 'Отмена записи: Ана Кикнадзе → Нино Ц. · 13 июля, 10:00 · Массаж')

  const second = await call(store, 'POST', '/api/bookings', { body: { ...newBooking, start: '12:00' } })
  const id = second.body.booking.id
  await call(store, 'POST', '/api/bookings/cancel-public', {
    body: { id, token: await cancelToken(ENV.SESSION_SECRET, id) },
  })
  assert.equal(store.notes.at(-1), 'Отмена записи (клиент сам): Ана Кикнадзе → Нино Ц. · 13 июля, 12:00 · Массаж')
})

test('ручная запись из админки видна как «из админки»', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  await call(store, 'POST', '/api/bookings/create', {
    token: login.body.token,
    body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '14:00', clientName: 'Дато' },
  })
  assert.equal(store.notes.at(-1), 'Новая запись (из админки): Дато → Нино Ц. · 13 июля, 14:00 · Массаж')
})

test('абонементы подписываются клиентом и числом посещений', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const token = login.body.token

  const saved = await call(store, 'POST', '/api/memberships/save', {
    token,
    body: { clientName: 'Ана Кикнадзе', clientPhone: '+995 555 12 34 56', total: 8 },
  })
  assert.equal(store.notes.at(-1), 'Новый абонемент: Ана Кикнадзе · 8 посещений')

  await call(store, 'POST', '/api/memberships/save', {
    token,
    body: { id: saved.body.membership.id, clientName: 'Ана Кикнадзе', clientPhone: '+995 555 12 34 56', total: 10 },
  })
  assert.equal(store.notes.at(-1), 'Абонемент изменён: Ана Кикнадзе · 10 посещений')

  await call(store, 'POST', '/api/memberships/delete', { token, body: { id: saved.body.membership.id } })
  assert.equal(store.notes.at(-1), 'Абонемент удалён: Ана Кикнадзе')
})
