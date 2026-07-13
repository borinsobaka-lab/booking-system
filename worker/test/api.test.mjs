import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/api.js'
import { emptyData, hashPassword } from '../src/logic.js'

// --- Фейковое хранилище в памяти (вместо GitHub) ---
function makeStore(initial) {
  let data = initial ?? emptyData()
  let sha = 'sha0'
  return {
    async get() {
      return { data: structuredClone(data), sha }
    },
    async put(next, _sha, _msg) {
      data = structuredClone(next)
      sha = 'sha' + Math.random()
      return { sha }
    },
    async update(mutator, _msg) {
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
const deps = (store) => ({ store, now: () => 1_700_000_000_000, rnd: () => (seq = (seq + 0.11) % 1) })

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
  // владелец + услуга + специалист + расписание на 2026-07-13
  const salt = 's1'
  const passwordHash = await hashPassword('pw', salt)
  const data = {
    ...emptyData(),
    users: [{ id: 'o1', role: 'owner', username: 'owner', salt, passwordHash, name: 'Гига', createdAt: 1 }],
    brand: { name: 'Студия', address: 'Тбилиси', avatar: null, banner: null },
    services: [{ id: 's1', name: 'Массаж', description: '', durationMin: 60, price: 3000, image: null, createdAt: 1 }],
    specialists: [{ id: 'p1', firstName: 'Нино', lastName: 'Ц.', role: 'Массажист', avatar: null, serviceIds: ['s1'], createdAt: 1 }],
    schedules: [{ specialistId: 'p1', date: '2026-07-13', windows: [{ start: '09:00', end: '18:00' }], breaks: [] }],
    bookings: [],
  }
  return makeStore(data)
}

test('регистрации нет: /api/auth/setup и /api/status недоступны', async () => {
  const store = makeStore()
  const setup = await call(store, 'POST', '/api/auth/setup', { body: { username: 'x', salt: 's', passwordHash: 'h' } })
  assert.equal(setup.status, 404)
  const status = await call(store, 'GET', '/api/status')
  assert.equal(status.status, 404)
})

test('login: верный пароль — токен, неверный — 401', async () => {
  const store = await seededStore()
  const ok = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  assert.equal(ok.status, 200)
  assert.ok(ok.body.token)
  const bad = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'nope' } })
  assert.equal(bad.status, 401)
})

test('public: без учёток и персональных данных', async () => {
  const store = await seededStore()
  const r = await call(store, 'GET', '/api/public')
  assert.equal(r.status, 200)
  assert.equal(r.body.users, undefined)
  assert.equal(r.body.services.length, 1)
  assert.equal(r.body.specialists.length, 1)
  assert.deepEqual(r.body.busy, [])
})

test('booking: свободный слот — ок, повтор — 409, контакты не в public', async () => {
  const store = await seededStore()
  const payload = {
    specialistId: 'p1',
    serviceId: 's1',
    date: '2026-07-13',
    start: '10:00',
    clientName: 'Мария',
    clientPhone: '+995 555',
    clientEmail: 'm@x.com',
    comment: 'тихо',
    consent: true,
  }
  const r1 = await call(store, 'POST', '/api/bookings', { body: payload })
  assert.equal(r1.status, 200)
  assert.equal(r1.body.booking.end, '11:00')
  // тот же слот занят
  const r2 = await call(store, 'POST', '/api/bookings', { body: payload })
  assert.equal(r2.status, 409)
  // без согласия — 400
  const r3 = await call(store, 'POST', '/api/bookings', { body: { ...payload, start: '12:00', consent: false } })
  assert.equal(r3.status, 400)
  // публичные данные показывают занятость, но без имени/телефона
  const pub = await call(store, 'GET', '/api/public')
  assert.equal(pub.body.busy.length, 1)
  assert.equal(pub.body.busy[0].start, '10:00')
  assert.equal(JSON.stringify(pub.body).includes('Мария'), false)
  assert.equal(JSON.stringify(pub.body).includes('995'), false)
})

test('GET /api/data: нужна сессия; секреты учёток не отдаются', async () => {
  const store = await seededStore()
  const noauth = await call(store, 'GET', '/api/data')
  assert.equal(noauth.status, 401)
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const r = await call(store, 'GET', '/api/data', { token: login.body.token })
  assert.equal(r.status, 200)
  assert.equal(r.body.data.users[0].passwordHash, undefined)
  assert.equal(r.body.data.users[0].salt, undefined)
  assert.equal(r.body.data.users[0].name, 'Гига')
})

test('PUT /api/data сохраняет отзывы, и они видны в /api/public', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const token = login.body.token
  const got = await call(store, 'GET', '/api/data', { token })
  const data = got.body.data
  data.reviews = [
    { id: 'rev1', specialistId: 'p1', authorName: 'Анна', rating: 5, text: 'Отлично!', date: '2026-07-01', avatar: null, createdAt: 1 },
  ]
  const put = await call(store, 'PUT', '/api/data', { token, body: { data } })
  assert.equal(put.status, 200)
  // сохранилось в хранилище
  assert.equal(store._peek().reviews.length, 1)
  // и отдаётся витрине
  const pub = await call(store, 'GET', '/api/public')
  assert.equal(pub.body.reviews.length, 1)
  assert.equal(pub.body.reviews[0].authorName, 'Анна')
  assert.equal(pub.body.reviews[0].rating, 5)
})

test('PUT /api/data: владелец меняет услуги; не-владелец не трогает учётки', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const token = login.body.token
  // читаем (без секретов), добавляем услугу, сохраняем
  const got = await call(store, 'GET', '/api/data', { token })
  const data = got.body.data
  data.services.push({ id: 's2', name: 'Спорт', description: '', durationMin: 90, price: 4500, image: null, createdAt: 2 })
  const put = await call(store, 'PUT', '/api/data', { token, body: { data } })
  assert.equal(put.status, 200)
  // секреты владельца сохранились (подтянулись из текущих)
  assert.equal(store._peek().users[0].passwordHash.length, 64)
  assert.equal(store._peek().services.length, 2)

  // не-владелец (мастер) не может изменить учётки
  const salt = 'm'
  const ph = await hashPassword('mpw', salt)
  store._peek().users.push({ id: 'm1', role: 'master', username: 'nino', salt, passwordHash: ph, name: 'Нино', createdAt: 3 })
  const mlogin = await call(store, 'POST', '/api/auth/login', { body: { username: 'nino', password: 'mpw' } })
  const mtoken = mlogin.body.token
  const mget = await call(store, 'GET', '/api/data', { token: mtoken })
  const mdata = mget.body.data
  mdata.users = [] // мастер пытается снести всех
  await call(store, 'PUT', '/api/data', { token: mtoken, body: { data: mdata } })
  assert.equal(store._peek().users.length, 2) // учётки на месте
})
