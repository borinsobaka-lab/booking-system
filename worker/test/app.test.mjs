import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/api.js'
import { emptyData, cancelToken, bookingNote, freeStarts, isSlotFree } from '../src/logic.js'

// Запись на массаж из приложения Lady Stretch: CORS для второго адреса,
// свободное время от сервера (/api/slots), метка источника и токен отмены.

// --- Хелперы: те же, что в api.test.mjs (фейковое хранилище в памяти) ---
function makeStore(initial) {
  let data = initial ?? emptyData()
  let sha = 'sha0'
  const notes = []
  return {
    async get() {
      return { data: structuredClone(data), sha }
    },
    async put(next) {
      data = structuredClone(next)
      return { sha: (sha = 'sha' + Math.random()) }
    },
    async update(mutator, message) {
      const cur = structuredClone(data)
      const next = mutator(cur)
      if (next === null) return { data: cur, sha, skipped: true }
      notes.push(typeof message === 'function' ? message(next) : message)
      data = structuredClone(next)
      return { data: next, sha }
    },
    notes,
    _peek: () => data,
  }
}

const ENV = { SESSION_SECRET: 'test-secret', CORS_ORIGIN: '*' }
// «Сейчас» = 2026-07-13 09:30 по Тбилиси (UTC+4) → 05:30 UTC.
const NOW = Date.UTC(2026, 6, 13, 5, 30)
let seq = 0
const deps = (store, now = NOW) => ({ store, now: () => now, rnd: () => (seq = (seq + 0.17) % 1) })

function req(method, path, { body, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (origin) headers.Origin = origin
  return new Request(`https://api.test${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function call(store, method, path, opts = {}) {
  const res = await handle(req(method, path, opts), opts.env || ENV, deps(store, opts.now))
  const text = await res.text()
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null }
}

// Два мастера, общий кабинет, услуги на 60 и 90 минут, запас до сеанса 2 часа.
function seeded() {
  return makeStore({
    ...emptyData(),
    settings: { minLeadMinutes: 120, rooms: 1 },
    services: [
      { id: 's60', name: { ru: 'Классика', en: 'Classic' }, description: '', durationMin: 60, price: 79, image: null, createdAt: 1 },
      { id: 's90', name: { ru: 'Релакс', en: 'Relax' }, description: '', durationMin: 90, price: 99, image: null, createdAt: 1 },
    ],
    specialists: [
      { id: 'p1', firstName: { ru: 'Нино' }, lastName: { ru: 'Ц.' }, role: '', avatar: null, serviceIds: ['s60', 's90'], createdAt: 1 },
      { id: 'p2', firstName: { ru: 'Роман' }, lastName: { ru: '' }, role: '', avatar: null, serviceIds: ['s60'], createdAt: 1 },
      { id: 'p3', firstName: { ru: 'Катя' }, lastName: { ru: '' }, role: '', avatar: null, serviceIds: ['s60'], inactive: true, createdAt: 1 },
    ],
    schedules: [
      { specialistId: 'p1', date: '2026-07-13', windows: [{ start: '09:00', end: '18:00' }], breaks: [{ start: '15:00', end: '16:00' }] },
      { specialistId: 'p2', date: '2026-07-13', windows: [{ start: '09:00', end: '14:00' }], breaks: [] },
      { specialistId: 'p3', date: '2026-07-13', windows: [{ start: '09:00', end: '18:00' }], breaks: [] },
      { specialistId: 'p1', date: '2026-07-15', windows: [{ start: '10:00', end: '12:00' }], breaks: [] },
      { specialistId: 'p1', date: '2026-07-12', windows: [{ start: '10:00', end: '12:00' }], breaks: [] },
    ],
    bookings: [],
  })
}

const booking = {
  specialistId: 'p1',
  serviceId: 's60',
  date: '2026-07-13',
  start: '12:00',
  clientName: 'Ана',
  clientPhone: '+995 555 12 34 56',
  clientEmail: 'ana@example.com',
  consent: true,
}

test('CORS: адреса через запятую — отвечаем тем, с которого пришёл запрос', async () => {
  const store = seeded()
  const env = { ...ENV, CORS_ORIGIN: 'https://booking.neba.space, https://app.lady-stretch.one' }
  const app = await call(store, 'GET', '/api/public', { env, origin: 'https://app.lady-stretch.one' })
  assert.equal(app.headers.get('Access-Control-Allow-Origin'), 'https://app.lady-stretch.one')
  const site = await call(store, 'GET', '/api/public', { env, origin: 'https://booking.neba.space' })
  assert.equal(site.headers.get('Access-Control-Allow-Origin'), 'https://booking.neba.space')
  // чужой сайт не получает своего адреса — браузер запрос не пропустит
  const evil = await call(store, 'GET', '/api/public', { env, origin: 'https://evil.example' })
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), 'https://booking.neba.space')
  // предварительный запрос браузера перед POST
  const res = await handle(req('OPTIONS', '/api/bookings', { origin: 'https://app.lady-stretch.one' }), env, deps(store))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://app.lady-stretch.one')
})

test('CORS: один адрес и «*» работают как раньше', async () => {
  const store = seeded()
  const one = await call(store, 'GET', '/api/public', {
    env: { ...ENV, CORS_ORIGIN: 'https://booking.neba.space' },
    origin: 'https://booking.neba.space',
  })
  assert.equal(one.headers.get('Access-Control-Allow-Origin'), 'https://booking.neba.space')
  const any = await call(store, 'GET', '/api/public', { origin: 'http://localhost:8081' })
  assert.equal(any.headers.get('Access-Control-Allow-Origin'), '*')
})

test('slots: сетка 30 минут, запас до сеанса, перерыв, деактивированный мастер', async () => {
  const store = seeded()
  const r = await call(store, 'GET', '/api/slots?days=7')
  assert.equal(r.status, 200)
  assert.equal(r.body.today, '2026-07-13')
  assert.equal(r.body.from, '2026-07-13')
  assert.equal(r.body.to, '2026-07-19')
  assert.equal(r.body.step, 30)
  // сейчас 09:30, запас 2 часа → первое время 11:30; перерыв 15–16; конец окна 18:00
  assert.deepEqual(r.body.slots.p1.s60['2026-07-13'], [
    '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '16:00', '16:30', '17:00',
  ])
  // 90 минут: должно целиком помещаться до перерыва и до конца окна
  assert.deepEqual(r.body.slots.p1.s90['2026-07-13'], ['11:30', '12:00', '12:30', '13:00', '13:30', '16:00', '16:30'])
  assert.deepEqual(r.body.slots.p2.s60['2026-07-13'], ['11:30', '12:00', '12:30', '13:00'])
  assert.deepEqual(r.body.slots.p1.s60['2026-07-15'], ['10:00', '10:30', '11:00'])
  // деактивированного мастера и прошедших дней нет
  assert.equal(r.body.slots.p3, undefined)
  assert.equal(r.body.slots.p1.s60['2026-07-12'], undefined)
  // в ответе нет ничего, кроме времени
  assert.equal(JSON.stringify(r.body).includes('Нино'), false)
})

test('slots: общий кабинет — запись у одного мастера закрывает время у другого', async () => {
  const store = seeded()
  const booked = await call(store, 'POST', '/api/bookings', { body: booking }) // p1, 12:00–13:00
  assert.equal(booked.status, 200)
  const r = await call(store, 'GET', '/api/slots?days=1')
  assert.deepEqual(r.body.slots.p1.s60['2026-07-13'], ['13:00', '13:30', '14:00', '16:00', '16:30', '17:00'])
  assert.deepEqual(r.body.slots.p2.s60['2026-07-13'], ['13:00'])
  // отмена освобождает время снова
  const id = booked.body.booking.id
  await call(store, 'POST', '/api/bookings/cancel-public', { body: { id, token: booked.body.cancelToken } })
  const again = await call(store, 'GET', '/api/slots?days=1')
  assert.equal(again.body.slots.p2.s60['2026-07-13'].length, 4)
})

test('slots: любое отданное время сервер принимает при записи', async () => {
  const store = seeded()
  const data = store._peek()
  const slots = freeStarts(data, '2026-07-13', 7, NOW, 'Asia/Tbilisi')
  let checked = 0
  for (const [sp, bySvc] of Object.entries(slots))
    for (const [svc, byDate] of Object.entries(bySvc))
      for (const [date, starts] of Object.entries(byDate))
        for (const start of starts) {
          assert.ok(isSlotFree(data, sp, svc, date, start), `${sp} ${svc} ${date} ${start}`)
          checked++
        }
  assert.ok(checked > 20)
})

test('slots: from в прошлом — с сегодняшнего дня; days ограничен 1..92', async () => {
  const store = seeded()
  const past = await call(store, 'GET', '/api/slots?from=2026-07-01&days=2')
  assert.equal(past.body.from, '2026-07-13')
  assert.equal(past.body.to, '2026-07-14')
  const later = await call(store, 'GET', '/api/slots?from=2026-07-15&days=1')
  assert.deepEqual(Object.keys(later.body.slots.p1.s60), ['2026-07-15'])
  const big = await call(store, 'GET', '/api/slots?days=1000')
  assert.equal(big.body.to, '2026-10-12') // 92 дня с 13 июля
  const junk = await call(store, 'GET', '/api/slots?from=junk&days=abc')
  assert.equal(junk.body.from, '2026-07-13')
  assert.equal(junk.body.to, '2026-08-12') // 31 день по умолчанию
})

test('запись из приложения: source сохраняется, подпись уведомления — «приложение Lady Stretch»', async () => {
  const store = seeded()
  const r = await call(store, 'POST', '/api/bookings', { body: { ...booking, source: 'lady-stretch-app', lang: 'ru' } })
  assert.equal(r.status, 200)
  assert.equal(r.body.booking.source, 'lady-stretch-app')
  assert.equal(store._peek().bookings[0].source, 'lady-stretch-app')
  assert.equal(store.notes.at(-1), 'Новая запись (приложение Lady Stretch): Ана → Нино Ц. · 13 июля, 12:00 · Классика')
  // мусор в source не сохраняется
  const junk = await call(store, 'POST', '/api/bookings', { body: { ...booking, start: '16:00', source: '<b>x</b>' } })
  assert.equal(junk.status, 200)
  assert.equal(junk.body.booking.source, undefined)
  assert.equal(store.notes.at(-1), 'Новая запись: Ана → Нино Ц. · 13 июля, 16:00 · Классика')
})

test('подпись о записи: неизвестный источник — как есть', () => {
  const data = { specialists: [{ id: 'p1', firstName: 'Нино', lastName: '' }], services: [] }
  const b = { specialistId: 'p1', date: '2026-07-13', start: '10:00', clientName: 'Ана', source: 'partner-x' }
  assert.equal(bookingNote('new', data, b), 'Новая запись (partner-x): Ана → Нино · 13 июля, 10:00')
})

test('запись отдаёт токен отмены: им отменяют запись, после отмены lookup — null', async () => {
  const store = seeded()
  const r = await call(store, 'POST', '/api/bookings', { body: booking })
  const { id } = r.body.booking
  assert.equal(r.body.cancelToken, await cancelToken(ENV.SESSION_SECRET, id))
  const token = encodeURIComponent(r.body.cancelToken)
  const before = await call(store, 'GET', `/api/bookings/lookup?id=${id}&token=${token}`)
  assert.equal(before.body.booking.start, '12:00')
  const cancel = await call(store, 'POST', '/api/bookings/cancel-public', { body: { id, token: r.body.cancelToken } })
  assert.equal(cancel.status, 200)
  assert.equal(store.notes.at(-1), 'Отмена записи (клиент сам): Ана → Нино Ц. · 13 июля, 12:00 · Классика')
  const after = await call(store, 'GET', `/api/bookings/lookup?id=${id}&token=${token}`)
  assert.equal(after.status, 200)
  assert.equal(after.body.booking, null)
  // повторная отмена — без ошибки
  const twice = await call(store, 'POST', '/api/bookings/cancel-public', { body: { id, token: r.body.cancelToken } })
  assert.deepEqual(twice.body, { ok: true, already: true })
})
