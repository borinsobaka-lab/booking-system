import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/api.js'
import { emptyData, hashPassword, cancelToken, reviewToken } from '../src/logic.js'

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

test('email: мастера/пользователи хранят email; в public его нет, админу виден', async () => {
  const store = await seededStore()
  store._peek().specialists[0].email = 'master@example.com'
  store._peek().users[0].email = 'owner@example.com'
  // публичные данные витрины — без email мастера
  const pub = await call(store, 'GET', '/api/public')
  assert.equal(JSON.stringify(pub.body).includes('master@example.com'), false)
  // админу (после входа) email виден и у пользователя, и у специалиста
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const data = await call(store, 'GET', '/api/data', { token: login.body.token })
  assert.equal(data.body.data.users[0].email, 'owner@example.com')
  assert.equal(data.body.data.specialists[0].email, 'master@example.com')
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

test('booking: минимальный запас до начала — слишком близко 409, попозже ок', async () => {
  const store = await seededStore()
  store._peek().settings = { minLeadMinutes: 120 } // запас 2 часа
  // «Сейчас» = 2026-07-13 09:30 по Тбилиси (UTC+4) → 05:30 UTC.
  const nowMs = Date.UTC(2026, 6, 13, 5, 30)
  const customDeps = { store, now: () => nowMs, rnd: () => 0.5 }
  const base = {
    specialistId: 'p1',
    serviceId: 's1',
    date: '2026-07-13',
    clientName: 'Мария',
    clientPhone: '+995 555',
    consent: true,
  }
  const callWith = async (payload) => {
    const res = await handle(req('POST', '/api/bookings', { body: payload }), ENV, customDeps)
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  // 10:00 — всего 30 минут до начала (< 120) → отказ
  const tooSoon = await callWith({ ...base, start: '10:00' })
  assert.equal(tooSoon.status, 409)
  // 12:00 — 150 минут до начала (≥ 120) → успех
  const okLater = await callWith({ ...base, start: '12:00' })
  assert.equal(okLater.status, 200)
  assert.equal(okLater.body.booking.start, '12:00')
})

test('public: настройки записи отдаются витрине', async () => {
  const store = await seededStore()
  store._peek().settings = { minLeadMinutes: 60 }
  const r = await call(store, 'GET', '/api/public')
  assert.equal(r.status, 200)
  assert.equal(r.body.settings.minLeadMinutes, 60)
})

test('cancel: нужна сессия; удаляет запись; нет записи — 404', async () => {
  const store = await seededStore()
  // создаём запись
  const payload = { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'М', clientPhone: '+1', consent: true }
  const r1 = await call(store, 'POST', '/api/bookings', { body: payload })
  const id = r1.body.booking.id
  // без сессии — 401
  const noauth = await call(store, 'POST', '/api/bookings/cancel', { body: { id } })
  assert.equal(noauth.status, 401)
  // с сессией — удаляет
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const ok = await call(store, 'POST', '/api/bookings/cancel', { token: login.body.token, body: { id } })
  assert.equal(ok.status, 200)
  // мягкое удаление: запись остаётся, но со статусом cancelled
  assert.equal(store._peek().bookings.length, 1)
  assert.equal(store._peek().bookings[0].status, 'cancelled')
  // повторно — 404
  const again = await call(store, 'POST', '/api/bookings/cancel', { token: login.body.token, body: { id } })
  assert.equal(again.status, 404)
})

test('admin create: нужна сессия; создаёт запись', async () => {
  const store = await seededStore()
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const body = { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '11:00', clientName: 'Гость' }
  const noauth = await call(store, 'POST', '/api/bookings/create', { body })
  assert.equal(noauth.status, 401)
  const ok = await call(store, 'POST', '/api/bookings/create', { token: login.body.token, body })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.booking.end, '12:00')
  assert.equal(store._peek().bookings.length, 1)
})

test('PUT /api/data не затирает записи (брони меняются только эндпоинтами)', async () => {
  const store = await seededStore()
  // создаём бронь через клиентский эндпоинт
  await call(store, 'POST', '/api/bookings', { body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'М', clientPhone: '+1', consent: true } })
  assert.equal(store._peek().bookings.length, 1)
  // админ сохраняет данные с пустым bookings — бронь должна остаться
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const got = await call(store, 'GET', '/api/data', { token: login.body.token })
  const d = got.body.data
  d.bookings = []
  await call(store, 'PUT', '/api/data', { token: login.body.token, body: { data: d } })
  assert.equal(store._peek().bookings.length, 1)
})

test('self-cancel: lookup и cancel-public по токену из письма', async () => {
  const store = await seededStore()
  const r1 = await call(store, 'POST', '/api/bookings', {
    body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'М', clientPhone: '+1', clientEmail: 'c@x.com', consent: true },
  })
  const id = r1.body.booking.id
  const token = await cancelToken(ENV.SESSION_SECRET, id)
  // неверный токен — 403
  const bad = await call(store, 'GET', `/api/bookings/lookup?id=${id}&token=nope`)
  assert.equal(bad.status, 403)
  // верный — отдаёт детали (без чужих данных)
  const look = await call(store, 'GET', `/api/bookings/lookup?id=${id}&token=${encodeURIComponent(token)}`)
  assert.equal(look.status, 200)
  assert.equal(look.body.booking.start, '10:00')
  assert.ok(look.body.service.length > 0)
  assert.equal(JSON.stringify(look.body).includes('+1'), false) // телефон клиента не отдаём
  // отмена: неверный токен — 403, верный — удаляет
  const badC = await call(store, 'POST', '/api/bookings/cancel-public', { body: { id, token: 'nope' } })
  assert.equal(badC.status, 403)
  const ok = await call(store, 'POST', '/api/bookings/cancel-public', { body: { id, token } })
  assert.equal(ok.status, 200)
  assert.equal(store._peek().bookings[0].status, 'cancelled')
})

test('pay: только владелец отмечает оплату сеанса; тумблер paidAt', async () => {
  const store = await seededStore()
  const r1 = await call(store, 'POST', '/api/bookings', {
    body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'М', clientPhone: '+1', consent: true },
  })
  const id = r1.body.booking.id
  // без сессии — 401
  const noauth = await call(store, 'POST', '/api/bookings/pay', { body: { id, paid: true } })
  assert.equal(noauth.status, 401)
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  const token = login.body.token
  // отметить оплаченным
  const ok = await call(store, 'POST', '/api/bookings/pay', { token, body: { id, paid: true } })
  assert.equal(ok.status, 200)
  assert.ok(store._peek().bookings[0].paidAt)
  // снять отметку
  const off = await call(store, 'POST', '/api/bookings/pay', { token, body: { id, paid: false } })
  assert.equal(off.status, 200)
  assert.equal(store._peek().bookings[0].paidAt, undefined)
  // несуществующая запись — 404
  const nf = await call(store, 'POST', '/api/bookings/pay', { token, body: { id: 'nope', paid: true } })
  assert.equal(nf.status, 404)
})

test('review: lookup и submit по токену из письма создают отзыв', async () => {
  const store = await seededStore()
  const r1 = await call(store, 'POST', '/api/bookings', {
    body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'Мария', clientPhone: '+1', clientEmail: 'c@x.com', consent: true },
  })
  const id = r1.body.booking.id
  const token = await reviewToken(ENV.SESSION_SECRET, id)
  // неверный токен — 403
  const bad = await call(store, 'GET', `/api/bookings/review-lookup?id=${id}&token=nope`)
  assert.equal(bad.status, 403)
  // верный — отдаёт мастера/услугу, ещё не оценено, имя клиента для подстановки
  const look = await call(store, 'GET', `/api/bookings/review-lookup?id=${id}&token=${encodeURIComponent(token)}`)
  assert.equal(look.status, 200)
  assert.equal(look.body.already, false)
  assert.ok(look.body.master.length > 0)
  assert.equal(look.body.clientName, 'Мария')
  // невалидная оценка — 400
  const badRating = await call(store, 'POST', '/api/reviews/submit', { body: { id, token, rating: 9, text: 'x' } })
  assert.equal(badRating.status, 400)
  // валидная оценка — создаёт отзыв, привязанный к специалисту, и помечает запись
  const ok = await call(store, 'POST', '/api/reviews/submit', { body: { id, token, rating: 5, text: 'Супер', authorName: 'Мария' } })
  assert.equal(ok.status, 200)
  assert.equal(store._peek().reviews.length, 1)
  assert.equal(store._peek().reviews[0].specialistId, 'p1')
  assert.equal(store._peek().reviews[0].rating, 5)
  assert.ok(store._peek().bookings[0].reviewSubmittedAt)
  // отзыв виден на витрине
  const pub = await call(store, 'GET', '/api/public')
  assert.equal(pub.body.reviews.length, 1)
  // повторная отправка — идемпотентно (already), второй отзыв не создаётся
  const again = await call(store, 'POST', '/api/reviews/submit', { body: { id, token, rating: 4, text: 'ещё' } })
  assert.equal(again.status, 200)
  assert.equal(again.body.already, true)
  assert.equal(store._peek().reviews.length, 1)
  // lookup теперь показывает already
  const look2 = await call(store, 'GET', `/api/bookings/review-lookup?id=${id}&token=${encodeURIComponent(token)}`)
  assert.equal(look2.body.already, true)
})

test('review: отменённую запись оценить нельзя', async () => {
  const store = await seededStore()
  const r1 = await call(store, 'POST', '/api/bookings', {
    body: { specialistId: 'p1', serviceId: 's1', date: '2026-07-13', start: '10:00', clientName: 'М', clientPhone: '+1', clientEmail: 'c@x.com', consent: true },
  })
  const id = r1.body.booking.id
  const token = await reviewToken(ENV.SESSION_SECRET, id)
  const login = await call(store, 'POST', '/api/auth/login', { body: { username: 'owner', password: 'pw' } })
  await call(store, 'POST', '/api/bookings/cancel', { token: login.body.token, body: { id } })
  const look = await call(store, 'GET', `/api/bookings/review-lookup?id=${id}&token=${encodeURIComponent(token)}`)
  assert.equal(look.body.booking, null)
  const submit = await call(store, 'POST', '/api/reviews/submit', { body: { id, token, rating: 5 } })
  assert.equal(submit.status, 404)
  assert.equal(store._peek().reviews.length, 0)
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
