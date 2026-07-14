import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueReminders, sendEmail, notifyBookingCreated, notifyBookingCancelled } from '../src/email.js'

// Мок Resend: перехватываем fetch, копим запросы.
function mockResend() {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) })
    return { ok: true, status: 200, json: async () => ({ id: 'em_' + calls.length }) }
  }
  return { calls, restore: () => (globalThis.fetch = orig) }
}

function fullData() {
  return {
    brand: { name: { en: 'NEBA', ka: 'NEBA', ru: 'NEBA' }, address: { ru: 'Тбилиси', en: 'Tbilisi', ka: '' } },
    // Почта теперь на сотрудниках; мастер — сотрудник, привязанный к специалисту.
    users: [
      { id: 'o', role: 'owner', email: 'owner@neba.ge', name: 'O' },
      { id: 'a', role: 'staff', email: 'admin@neba.ge', name: 'A' },
      { id: 'm', role: 'staff', email: 'master@neba.ge', name: 'M', specialistId: 'p1' },
    ],
    specialists: [{ id: 'p1', firstName: { ru: 'Екатерина' }, lastName: { ru: 'М.' }, role: { ru: 'Массажист' } }],
    services: [{ id: 's1', name: { ru: 'Массаж', en: 'Massage' }, price: 120, durationMin: 60 }],
    bookings: [],
  }
}
const booking = { id: 'b1', specialistId: 'p1', serviceId: 's1', date: '2026-07-14', start: '12:00', end: '13:00', clientEmail: 'client@x.com', clientName: 'Мария', clientPhone: '+995', lang: 'en' }

const TZ = 'Asia/Tbilisi' // UTC+4, без перехода на летнее время

function data(bookings) {
  return { bookings, users: [], specialists: [], services: [], brand: { name: 'NEBA' } }
}

test('dueReminders: запись в пределах часа и с email — созрела', () => {
  // now = 2026-07-14 11:30 Тбилиси (07:30 UTC)
  const now = Date.UTC(2026, 6, 14, 7, 30)
  const d = data([
    { id: 'b1', date: '2026-07-14', start: '12:00', clientEmail: 'c@x.com' }, // через 30 мин — да
    { id: 'b2', date: '2026-07-14', start: '14:00', clientEmail: 'c@x.com' }, // через 2.5 ч — нет
    { id: 'b3', date: '2026-07-14', start: '12:00', clientEmail: 'c@x.com', reminderSentAt: 1 }, // уже напомнено
    { id: 'b4', date: '2026-07-14', start: '12:00' }, // без email — нет
  ])
  const due = dueReminders(d, now, 60, TZ).map((b) => b.id)
  assert.deepEqual(due, ['b1'])
})

test('dueReminders: прошедшую запись не напоминаем', () => {
  const now = Date.UTC(2026, 6, 14, 9, 0) // 13:00 Тбилиси
  const d = data([{ id: 'b1', date: '2026-07-14', start: '12:00', clientEmail: 'c@x.com' }])
  assert.deepEqual(dueReminders(d, now, 60, TZ), [])
})

test('sendEmail: без RESEND_API_KEY — ничего не шлём (null)', async () => {
  const r = await sendEmail({}, { to: 'a@b.com', subject: 's', html: '<p>h</p>' })
  assert.equal(r, null)
})

test('notifyBookingCreated: письма клиенту, сотрудникам и мастеру', async () => {
  const m = mockResend()
  try {
    await notifyBookingCreated({ RESEND_API_KEY: 're_x' }, fullData(), booking)
    // 3 письма: клиент, сотрудники (owner+admin одним письмом), мастер
    assert.equal(m.calls.length, 3)
    const tos = m.calls.map((c) => c.body.to)
    assert.ok(tos.some((t) => t.includes('client@x.com')), 'клиенту')
    assert.ok(tos.some((t) => t.includes('owner@neba.ge') && t.includes('admin@neba.ge')), 'сотрудникам')
    assert.ok(tos.some((t) => t.includes('master@neba.ge')), 'мастеру (из карточки специалиста)')
    // язык клиента — английский
    const clientMail = m.calls.find((c) => c.body.to.includes('client@x.com'))
    assert.ok(/Booking confirmed/.test(clientMail.body.subject))
  } finally {
    m.restore()
  }
})

test('письмо клиенту: английский, дисклеймер и кнопка отмены', async () => {
  const m = mockResend()
  try {
    const env = { RESEND_API_KEY: 're_x', SESSION_SECRET: 's3cr3t', CLIENT_BASE_URL: 'https://x.dev/booking-system' }
    await notifyBookingCreated(env, fullData(), booking)
    const clientMail = m.calls.find((c) => c.body.to.includes('client@x.com'))
    assert.match(clientMail.body.subject, /Booking confirmed/)
    assert.match(clientMail.body.html, /sent automatically/)
    assert.match(clientMail.body.html, /Cancel booking/)
    assert.match(clientMail.body.html, /#\/cancel\?id=/)
  } finally {
    m.restore()
  }
})

test('TEST_EMAIL: все письма уходят на один адрес', async () => {
  const m = mockResend()
  try {
    await notifyBookingCreated({ RESEND_API_KEY: 're_x', TEST_EMAIL: 'me@test.com' }, fullData(), booking)
    for (const c of m.calls) assert.deepEqual(c.body.to, ['me@test.com'])
  } finally {
    m.restore()
  }
})

test('notifyBookingCancelled: письма клиенту, сотрудникам (владельцу) и мастеру', async () => {
  const m = mockResend()
  try {
    await notifyBookingCancelled({ RESEND_API_KEY: 're_x' }, fullData(), booking)
    // клиент + сотрудники (owner+admin одним письмом) + мастер = 3
    assert.equal(m.calls.length, 3)
    const tos = m.calls.map((c) => c.body.to.join(','))
    assert.ok(tos.some((t) => t.includes('client@x.com')), 'клиенту')
    assert.ok(tos.some((t) => t.includes('owner@neba.ge') && t.includes('admin@neba.ge')), 'сотрудникам (владельцу)')
    assert.ok(tos.some((t) => t.includes('master@neba.ge')), 'мастеру')
  } finally {
    m.restore()
  }
})
