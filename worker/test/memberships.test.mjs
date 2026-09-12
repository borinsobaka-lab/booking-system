import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/api.js'
import { emptyData, hashPassword, applyMemberships, phoneKey } from '../src/logic.js'

// --- Хелперы: те же, что в api.test.mjs (фейковое хранилище в памяти) ---
function makeStore(initial) {
  let data = initial ?? emptyData()
  let sha = 'sha0'
  return {
    async get() {
      return { data: structuredClone(data), sha }
    },
    async put(next) {
      data = structuredClone(next)
      return { sha: (sha = 'sha' + Math.random()) }
    },
    async update(mutator) {
      const cur = structuredClone(data)
      const next = mutator(cur)
      if (next === null) return { data: cur, sha, skipped: true }
      data = structuredClone(next)
      return { data: next, sha }
    },
    _peek: () => data,
  }
}

const ENV = { SESSION_SECRET: 'test-secret', CORS_ORIGIN: '*' }
let seq = 0
const deps = (store) => ({ store, now: () => 1_700_000_000_000, rnd: () => (seq = (seq + 0.13) % 1) })
const TODAY = '2023-11-14' // studioToday(1_700_000_000_000) по Тбилиси

function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request(`https://api.test${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function call(store, method, path, opts) {
  const res = await handle(req(method, path, opts), ENV, deps(store))
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function seededStore() {
  const salt = 's1'
  const passwordHash = await hashPassword('pw', salt)
  const staffHash = await hashPassword('pw', 's2')
  return makeStore({
    ...emptyData(),
    users: [
      { id: 'o1', role: 'owner', username: 'owner', salt, passwordHash, name: 'Гига', createdAt: 1 },
      { id: 'u2', role: 'staff', username: 'masseur', salt: 's2', passwordHash: staffHash, name: 'Нино', createdAt: 2 },
    ],
    brand: { name: 'Студия', address: 'Тбилиси', avatar: null, banner: null },
    services: [{ id: 's1', name: 'Массаж', description: '', durationMin: 60, price: 3000, image: null, createdAt: 1 }],
    specialists: [
      { id: 'p1', firstName: 'Нино', lastName: 'Ц.', role: 'Массажист', avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ],
    schedules: [
      { specialistId: 'p1', date: '2026-07-13', windows: [{ start: '09:00', end: '18:00' }], breaks: [] },
      { specialistId: 'p1', date: '2026-07-14', windows: [{ start: '09:00', end: '18:00' }], breaks: [] },
    ],
    bookings: [],
  })
}

async function tokenFor(store, username) {
  const r = await call(store, 'POST', '/api/auth/login', { body: { username, password: 'pw' } })
  return r.body.token
}

// --- Правила списания (чистая логика) ---

const bk = (id, date, start, phone, extra = {}) => ({
  id,
  specialistId: 'p1',
  serviceId: 's1',
  date,
  start,
  end: '10:00',
  status: 'confirmed',
  clientPhone: phone,
  createdAt: 1,
  ...extra,
})

const ms = (id, phone, total, extra = {}) => ({
  id,
  clientPhone: phone,
  total,
  used: 0,
  startDate: TODAY,
  createdAt: 1,
  ...extra,
})

test('телефон сравнивается по значимому хвосту', () => {
  assert.equal(phoneKey('+995 555 12 34 56'), phoneKey('555123456'))
  assert.notEqual(phoneKey('+995 555 12 34 56'), phoneKey('+995 555 99 99 99'))
  assert.equal(phoneKey('123'), '') // мусор не совпадает ни с чем
})

test('абонемент помечает уже назначенные записи клиента', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 2)],
    bookings: [
      bk('b1', '2026-07-13', '10:00', '+995 555 12 34 56'),
      bk('b2', '2026-07-13', '12:00', '555 12 34 56'), // тот же номер без кода страны
      bk('b3', '2026-07-14', '10:00', '+995 555 12 34 56'),
      bk('b4', '2026-07-13', '14:00', '+995 599 00 00 00'), // другой клиент
    ],
  }
  applyMemberships(data, TODAY)
  const byId = Object.fromEntries(data.bookings.map((b) => [b.id, b]))
  assert.equal(byId.b1.membershipId, 'm1')
  assert.equal(byId.b2.membershipId, 'm1')
  assert.equal(byId.b3.membershipId, undefined, 'визитов только два — третья запись обычная')
  assert.equal(byId.b4.membership, undefined, 'чужой номер абонемент не трогает')
  assert.equal(data.memberships[0].used, 2)
})

test('отмена возвращает визит, и он уходит следующей записи', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 1)],
    bookings: [
      bk('b1', '2026-07-13', '10:00', '+995 555 12 34 56'),
      bk('b2', '2026-07-14', '10:00', '+995 555 12 34 56'),
    ],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membershipId, 'm1')
  assert.equal(data.bookings[1].membershipId, undefined)

  data.bookings[0].status = 'cancelled'
  applyMemberships(data, TODAY)
  assert.equal(data.memberships[0].used, 1, 'визит перешёл на следующую запись')
  assert.equal(data.bookings[1].membershipId, 'm1')

  data.bookings[1].status = 'cancelled'
  applyMemberships(data, TODAY)
  assert.equal(data.memberships[0].used, 0, 'обе записи отменены — абонемент целый')
})

test('прошедшие визиты потрачены и не пересматриваются', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 2, { startDate: '2023-01-01' })],
    bookings: [
      bk('b1', '2023-10-01', '10:00', '+995 555 12 34 56', { membershipId: 'm1', membership: true }),
      bk('b2', '2026-07-13', '10:00', '+995 555 12 34 56'),
      bk('b3', '2026-07-14', '10:00', '+995 555 12 34 56'),
    ],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membershipId, 'm1')
  assert.equal(data.bookings[1].membershipId, 'm1', 'остался один визит — уходит ближайшей записи')
  assert.equal(data.bookings[2].membershipId, undefined)
  assert.equal(data.memberships[0].used, 2)
})

test('старые записи до даты начала абонемента сами не помечаются', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 5, { startDate: '2023-11-14' })],
    bookings: [bk('b1', '2023-10-01', '10:00', '+995 555 12 34 56')],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membership, undefined)
  assert.equal(data.memberships[0].used, 0)
})

test('снятая вручную метка автоматикой не возвращается', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 3)],
    bookings: [bk('b1', '2026-07-13', '10:00', '+995 555 12 34 56', { membershipOptOut: true })],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membership, undefined)
  assert.equal(data.memberships[0].used, 0)
})

test('удалённый абонемент: будущие записи обычные, история не переписывается', () => {
  const data = {
    memberships: [],
    bookings: [
      bk('b1', '2023-10-01', '10:00', '+995 555 12 34 56', { membershipId: 'm1', membership: true }),
      bk('b2', '2026-07-13', '10:00', '+995 555 12 34 56', { membershipId: 'm1', membership: true }),
    ],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membership, true, 'прошедший визит остаётся «по абонементу»')
  assert.equal(data.bookings[0].membershipId, undefined)
  assert.equal(data.bookings[1].membership, undefined, 'будущая запись снова обычная')
})

test('два абонемента на один телефон тратятся по очереди', () => {
  const data = {
    memberships: [ms('m1', '+995 555 12 34 56', 1), ms('m2', '+995 555 12 34 56', 2, { createdAt: 5 })],
    bookings: [
      bk('b1', '2026-07-13', '10:00', '+995 555 12 34 56'),
      bk('b2', '2026-07-13', '12:00', '+995 555 12 34 56'),
    ],
  }
  applyMemberships(data, TODAY)
  assert.equal(data.bookings[0].membershipId, 'm1', 'сначала тратится тот, что оформлен раньше')
  assert.equal(data.bookings[1].membershipId, 'm2')
  assert.equal(data.memberships[0].used, 1)
  assert.equal(data.memberships[1].used, 1)
})

// --- API ---

test('абонементы: заводит владелец, сотруднику — 403', async () => {
  const store = await seededStore()
  const owner = await tokenFor(store, 'owner')
  const staff = await tokenFor(store, 'masseur')

  const denied = await call(store, 'POST', '/api/memberships/save', {
    token: staff,
    body: { clientPhone: '+995 555 12 34 56', total: 5 },
  })
  assert.equal(denied.status, 403)

  const ok = await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientName: 'Ана', clientPhone: '+995 555 12 34 56', total: 5 },
  })
  assert.equal(ok.status, 200)
  assert.equal(store._peek().memberships.length, 1)
  assert.equal(store._peek().memberships[0].used, 0)

  const bad = await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientPhone: '+995 555 12 34 56', total: 0 },
  })
  assert.equal(bad.status, 400)
})

test('новая запись клиента списывает визит, отмена возвращает', async () => {
  const store = await seededStore()
  const owner = await tokenFor(store, 'owner')
  await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientPhone: '+995 555 12 34 56', total: 2 },
  })

  const booked = await call(store, 'POST', '/api/bookings', {
    body: {
      specialistId: 'p1',
      serviceId: 's1',
      date: '2026-07-13',
      start: '10:00',
      clientName: 'Ана',
      clientPhone: '+995 555 12 34 56',
      consent: true,
    },
  })
  assert.equal(booked.status, 200)
  assert.equal(booked.body.booking.membership, true, 'запись сразу идёт по абонементу')
  assert.equal(store._peek().memberships[0].used, 1)

  const cancelled = await call(store, 'POST', '/api/bookings/cancel', {
    token: owner,
    body: { id: booked.body.booking.id },
  })
  assert.equal(cancelled.status, 200)
  assert.equal(store._peek().memberships[0].used, 0, 'визит вернулся на абонемент')
})

test('клиент без абонемента записывается как обычно', async () => {
  const store = await seededStore()
  const booked = await call(store, 'POST', '/api/bookings', {
    body: {
      specialistId: 'p1',
      serviceId: 's1',
      date: '2026-07-13',
      start: '11:00',
      clientName: 'Гость',
      clientPhone: '+995 599 00 00 00',
      consent: true,
    },
  })
  assert.equal(booked.status, 200)
  assert.equal(booked.body.booking.membership, undefined)
})

test('удаление абонемента снимает метку с будущей записи', async () => {
  const store = await seededStore()
  const owner = await tokenFor(store, 'owner')
  const saved = await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientPhone: '+995 555 12 34 56', total: 3 },
  })
  await call(store, 'POST', '/api/bookings', {
    body: {
      specialistId: 'p1',
      serviceId: 's1',
      date: '2026-07-13',
      start: '10:00',
      clientName: 'Ана',
      clientPhone: '+995 555 12 34 56',
      consent: true,
    },
  })
  assert.equal(store._peek().bookings[0].membership, true)

  const del = await call(store, 'POST', '/api/memberships/delete', {
    token: owner,
    body: { id: saved.body.membership.id },
  })
  assert.equal(del.status, 200)
  assert.equal(store._peek().memberships.length, 0)
  assert.equal(store._peek().bookings[0].membership, undefined)
})

test('PUT /api/data не затирает абонементы из браузера', async () => {
  const store = await seededStore()
  const owner = await tokenFor(store, 'owner')
  await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientPhone: '+995 555 12 34 56', total: 4 },
  })
  const put = await call(store, 'PUT', '/api/data', {
    token: owner,
    body: { data: { ...emptyData(), memberships: [] } },
  })
  assert.equal(put.status, 200)
  assert.equal(store._peek().memberships.length, 1, 'абонементы меняются только своими эндпоинтами')
})

test('ручная отметка привязывает запись к абонементу, снятие — отвязывает навсегда', async () => {
  const store = await seededStore()
  const owner = await tokenFor(store, 'owner')
  await call(store, 'POST', '/api/memberships/save', {
    token: owner,
    body: { clientPhone: '+995 555 12 34 56', total: 1 },
  })
  const booked = await call(store, 'POST', '/api/bookings', {
    body: {
      specialistId: 'p1',
      serviceId: 's1',
      date: '2026-07-13',
      start: '10:00',
      clientName: 'Ана',
      clientPhone: '+995 555 12 34 56',
      consent: true,
    },
  })
  const id = booked.body.booking.id

  const off = await call(store, 'POST', '/api/bookings/membership', { token: owner, body: { id, membership: false } })
  assert.equal(off.status, 200)
  assert.equal(store._peek().bookings[0].membership, undefined)
  assert.equal(store._peek().memberships[0].used, 0, 'визит вернулся на абонемент')

  const on = await call(store, 'POST', '/api/bookings/membership', { token: owner, body: { id, membership: true } })
  assert.equal(on.status, 200)
  assert.equal(store._peek().bookings[0].membershipId, store._peek().memberships[0].id)
  assert.equal(store._peek().memberships[0].used, 1)
})
