// Email-уведомления через Resend (https://resend.com). Все письма — на английском.
// Всё поведение — за переменными окружения; если ключа нет, функции ничего не
// делают (система работает как раньше). Никаких секретов в коде.
//
// Переменные окружения (секреты/vars Worker'а):
//   RESEND_API_KEY   — ключ API Resend (re_...). Без него письма не шлются.
//   EMAIL_FROM       — отправитель, напр. "NEBA <noreply@ваш-домен>". По умолчанию
//                      onboarding@resend.dev (только для теста — письма уходят
//                      лишь на адрес аккаунта Resend).
//   EMAIL_REPLY_TO   — (необязательно) адрес для ответов.
//   TEST_EMAIL       — (тест) все письма уходят на этот адрес.
//   STUDIO_TZ        — таймзона салона (по умолчанию Asia/Tbilisi).
//   CLIENT_BASE_URL  — адрес витрины (для ссылки «отменить запись»).
//   SESSION_SECRET   — используется для подписи токена отмены.

import { cancelToken } from './logic.js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const LANG = 'en'

// --- Контент ---

function loc(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.en || v.ru || v.ka || ''
}
function specName(sp) {
  return `${loc(sp.firstName)} ${loc(sp.lastName)}`.trim()
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return `${d} ${MONTHS_EN[(m || 1) - 1]} ${y}`
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
function digits(s) {
  return String(s || '').replace(/[^\d]/g, '')
}

// --- Отправка через Resend ---

export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env || !env.RESEND_API_KEY) return null
  let recipients = Array.isArray(to) ? to.filter(Boolean) : to ? [to] : []
  if (recipients.length === 0) return null
  if (env.TEST_EMAIL) recipients = [env.TEST_EMAIL]

  const from = env.EMAIL_FROM || 'NEBA <onboarding@resend.dev>'
  const body = { from, to: recipients, subject, html }
  const rt = replyTo || env.EMAIL_REPLY_TO
  if (rt) body.reply_to = rt

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('Resend error', res.status, await res.text())
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('Resend fetch failed', e && e.message)
    return null
  }
}

// --- Получатели ---

function staffEmails(data) {
  return (data.users || [])
    .filter((u) => u.email && (u.role === 'owner' || u.role === 'admin'))
    .map((u) => u.email)
}
function masterEmail(data, specialistId) {
  const sp = (data.specialists || []).find((s) => s.id === specialistId)
  if (sp && sp.email) return sp.email
  const u = (data.users || []).find((x) => x.specialistId === specialistId && x.email)
  return u ? u.email : null
}

function bookingContext(data, booking) {
  const svc = (data.services || []).find((s) => s.id === booking.serviceId)
  const sp = (data.specialists || []).find((s) => s.id === booking.specialistId)
  const settings = data.settings || {}
  return {
    brand: loc(data.brand && data.brand.name) || 'NEBA',
    address: loc(data.brand && data.brand.address),
    phone: settings.phone || '',
    whatsapp: settings.whatsapp || '',
    service: svc ? loc(svc.name) : '',
    master: sp ? specName(sp) : '',
    date: fmtDate(booking.date),
    time: `${booking.start}–${booking.end}`,
    price: svc ? svc.price : null,
    clientName: booking.clientName || '',
    clientPhone: booking.clientPhone || '',
  }
}

async function cancelUrl(env, booking) {
  if (!env.SESSION_SECRET || !env.CLIENT_BASE_URL) return null
  const token = await cancelToken(env.SESSION_SECRET, booking.id)
  const base = env.CLIENT_BASE_URL.replace(/\/+$/, '')
  return `${base}/#/cancel?id=${encodeURIComponent(booking.id)}&t=${encodeURIComponent(token)}`
}

// --- Общий каркас письма ---

const DISCLAIMER = `This email was sent automatically, you do not need to respond to it.<br><br>
This e-mail message and any files transmitted with it are intended for use only by the addressee and are not subject to disclosure. Any unauthorized use, storage, copying, disclosure or distribution is prohibited. If you are not a prospective addressee and the message came to you in error, please inform the sender of this with a reply and delete all copies of the original message and attachments to it.`

function infoTable(ctx) {
  const rows = [
    ['Service', esc(ctx.service)],
    ['Specialist', esc(ctx.master)],
    ['When', `${esc(ctx.date)}, ${esc(ctx.time)}`],
  ]
  if (ctx.price != null) rows.push(['Price', `${ctx.price} ₾`])
  return `<table role="presentation" style="font-size:14px;line-height:1.6;border-collapse:collapse">${rows
    .map((r) => `<tr><td style="padding:3px 14px 3px 0;color:#777">${r[0]}</td><td style="padding:3px 0"><b>${r[1]}</b></td></tr>`)
    .join('')}</table>`
}

function contactsBlock(ctx) {
  const items = []
  if (ctx.address) items.push(esc(ctx.address))
  if (ctx.phone) items.push(`Phone: <a href="tel:${esc(digits(ctx.phone))}" style="color:#3b3b3b">${esc(ctx.phone)}</a>`)
  if (ctx.whatsapp) items.push(`WhatsApp: <a href="https://wa.me/${digits(ctx.whatsapp)}" style="color:#3b3b3b">${esc(ctx.whatsapp)}</a>`)
  if (items.length === 0) return ''
  return `<p style="margin:18px 0 0;color:#555;font-size:13px;line-height:1.7">${items.join('<br>')}</p>`
}

function cancelButton(url) {
  if (!url) return ''
  return `<p style="margin:22px 0 4px"><a href="${esc(url)}" style="display:inline-block;background:#eee;color:#b3261e;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Cancel booking</a></p>`
}

function layout(ctx, { title, intro, cancelUrl: cUrl, showContacts }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1c1e">
  <table role="presentation" width="100%" style="max-width:540px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#3b3b3b;color:#fff;padding:20px 24px;font-size:18px;font-weight:700">${esc(ctx.brand)}</td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px">${esc(title)}</h1>
      <p style="margin:0 0 16px;color:#555;line-height:1.5">${intro}</p>
      ${infoTable(ctx)}
      ${cancelButton(cUrl)}
      ${showContacts ? contactsBlock(ctx) : ''}
    </td></tr>
    <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eee;color:#9a9a9a;font-size:11px;line-height:1.6">${DISCLAIMER}</td></tr>
  </table></body></html>`
}

// --- Публичные хуки ---

/** При создании записи: письма клиенту, сотрудникам и мастеру. */
export async function notifyBookingCreated(env, data, booking) {
  if (!env || !env.RESEND_API_KEY) return
  const ctx = bookingContext(data, booking)
  const cUrl = await cancelUrl(env, booking)
  const jobs = []

  if (booking.clientEmail) {
    const html = layout(ctx, {
      title: 'Booking confirmed',
      intro: `Hello${ctx.clientName ? ', ' + esc(ctx.clientName) : ''}! Your booking is confirmed. See you soon.`,
      cancelUrl: cUrl,
      showContacts: true,
    })
    jobs.push(sendEmail(env, { to: booking.clientEmail, subject: `Booking confirmed — ${ctx.brand}`, html }))
  }
  const staff = staffEmails(data)
  if (staff.length) {
    const html = layout(ctx, {
      title: 'New booking',
      intro: `New booking${ctx.clientName ? ` from ${esc(ctx.clientName)}` : ''}.${ctx.clientPhone ? ` Phone: ${esc(ctx.clientPhone)}.` : ''}`,
      showContacts: false,
    })
    jobs.push(sendEmail(env, { to: staff, subject: `New booking — ${ctx.brand}`, html }))
  }
  const master = masterEmail(data, booking.specialistId)
  if (master) {
    const html = layout(ctx, {
      title: 'New booking for you',
      intro: `You have a new booking${ctx.clientName ? `: ${esc(ctx.clientName)}` : ''}.${ctx.clientPhone ? ` Phone: ${esc(ctx.clientPhone)}.` : ''}`,
      showContacts: false,
    })
    jobs.push(sendEmail(env, { to: master, subject: `New booking for you — ${ctx.brand}`, html }))
  }
  await Promise.all(jobs)
}

/** При отмене записи: письма клиенту и мастеру. */
export async function notifyBookingCancelled(env, data, booking) {
  if (!env || !env.RESEND_API_KEY) return
  const ctx = bookingContext(data, booking)
  const jobs = []
  if (booking.clientEmail) {
    const html = layout(ctx, {
      title: 'Booking cancelled',
      intro: 'Your booking has been cancelled. If this was a mistake, please book again or contact us.',
      showContacts: true,
    })
    jobs.push(sendEmail(env, { to: booking.clientEmail, subject: `Booking cancelled — ${ctx.brand}`, html }))
  }
  const master = masterEmail(data, booking.specialistId)
  if (master) {
    const html = layout(ctx, {
      title: 'Booking cancelled',
      intro: `A booking was cancelled${ctx.clientName ? ` (client ${esc(ctx.clientName)})` : ''}.`,
      showContacts: false,
    })
    jobs.push(sendEmail(env, { to: master, subject: `Booking cancelled — ${ctx.brand}`, html }))
  }
  await Promise.all(jobs)
}

/** Напоминание клиенту (вызывается из cron). */
export async function sendReminder(env, data, booking) {
  if (!env || !env.RESEND_API_KEY || !booking.clientEmail) return
  const ctx = bookingContext(data, booking)
  const cUrl = await cancelUrl(env, booking)
  const html = layout(ctx, {
    title: 'See you in an hour',
    intro: `A reminder: today at ${esc(booking.start)} ${esc(ctx.master)} is waiting for you.`,
    cancelUrl: cUrl,
    showContacts: true,
  })
  await sendEmail(env, { to: booking.clientEmail, subject: `Reminder: your appointment in 1 hour — ${ctx.brand}`, html })
}

// --- Напоминания «за час» (cron) ---

function wallMs(date, start) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = start.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, mi)
}
function studioWallMs(nowMs, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Asia/Tbilisi',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(nowMs))
  const g = (t) => Number(parts.find((p) => p.type === t).value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
}

export function dueReminders(data, nowMs, leadMinutes, tz) {
  const nowWall = studioWallMs(nowMs, tz)
  const lead = (leadMinutes || 60) * 60_000
  return (data.bookings || []).filter((b) => {
    if (b.reminderSentAt || !b.clientEmail) return false
    const startWall = wallMs(b.date, b.start)
    return nowWall >= startWall - lead && nowWall < startWall
  })
}

export async function runReminders(env, store, nowMs) {
  if (!env || !env.RESEND_API_KEY) return { sent: 0 }
  const lead = Number(env.REMINDER_LEAD_MINUTES) || 60
  const tz = env.STUDIO_TZ
  let due = []
  let saved = null
  await store.update((data) => {
    due = dueReminders(data, nowMs, lead, tz)
    if (due.length === 0) return null
    const ids = new Set(due.map((b) => b.id))
    for (const b of data.bookings) if (ids.has(b.id)) b.reminderSentAt = nowMs
    saved = data
    return data
  }, 'reminders: mark sent')
  for (const b of due) await sendReminder(env, saved, b)
  return { sent: due.length }
}
