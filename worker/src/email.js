// Email-уведомления через Resend (https://resend.com).
// Всё поведение — за переменными окружения; если ключа нет, функции ничего не
// делают (система работает как раньше). Никаких секретов в коде.
//
// Переменные окружения (секреты Worker'а):
//   RESEND_API_KEY   — ключ API Resend (re_...). Без него письма не шлются.
//   EMAIL_FROM       — отправитель, напр. "NEBA <noreply@ваш-домен>". По умолчанию
//                      onboarding@resend.dev (годится только для теста — письма
//                      уходят лишь на адрес вашего аккаунта Resend).
//   EMAIL_REPLY_TO   — (необязательно) адрес для ответов клиента.
//   TEST_EMAIL       — (тест) если задан, ВСЕ письма уходят на этот адрес, а не
//                      реальным получателям. Удобно, пока домен не подтверждён.
//   STUDIO_TZ        — таймзона салона (по умолчанию Asia/Tbilisi) — для «за час».

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// --- Локализация контента ---

function loc(v, lang) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v[lang] || v.en || v.ru || v.ka || ''
}

function specName(sp, lang) {
  return `${loc(sp.firstName, lang)} ${loc(sp.lastName, lang)}`.trim()
}

const MONTHS = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ka: ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'],
}

function fmtDate(dateStr, lang) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  const months = MONTHS[lang] || MONTHS.ru
  return `${d} ${months[(m || 1) - 1]} ${y}`
}

// --- Отправка через Resend ---

/**
 * Отправить письмо. Возвращает { id } при успехе, null — если Resend не настроен
 * или адресатов нет. Ошибки Resend логируются, но не роняют бронирование.
 */
export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env || !env.RESEND_API_KEY) return null
  let recipients = Array.isArray(to) ? to.filter(Boolean) : to ? [to] : []
  if (recipients.length === 0) return null
  // Тестовый режим: все письма — на один адрес (пока домен не подтверждён).
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

// --- Разбор получателей ---

function staffEmails(data) {
  return (data.users || [])
    .filter((u) => u.email && (u.role === 'owner' || u.role === 'admin'))
    .map((u) => u.email)
}

/** Email мастера: сначала из карточки специалиста, иначе из привязанной учётки. */
function masterEmail(data, specialistId) {
  const sp = (data.specialists || []).find((s) => s.id === specialistId)
  if (sp && sp.email) return sp.email
  const u = (data.users || []).find((x) => x.specialistId === specialistId && x.email)
  return u ? u.email : null
}

function bookingContext(data, booking, lang) {
  const svc = (data.services || []).find((s) => s.id === booking.serviceId)
  const sp = (data.specialists || []).find((s) => s.id === booking.specialistId)
  return {
    brand: loc(data.brand && data.brand.name, lang) || 'NEBA',
    address: loc(data.brand && data.brand.address, lang),
    service: svc ? loc(svc.name, lang) : '',
    master: sp ? specName(sp, lang) : '',
    date: fmtDate(booking.date, lang),
    time: `${booking.start}–${booking.end}`,
    price: svc ? svc.price : null,
    clientName: booking.clientName || '',
  }
}

// --- Шаблоны (простой инлайновый HTML, письма читаемы в любом клиенте) ---

function layout(title, introHtml, ctx, footer) {
  const rows = [
    ['', ctx.service],
    ['', ctx.master],
    ['', `${ctx.date}, ${ctx.time}`],
  ]
  const infoRows = [
    `<tr><td style="padding:4px 12px 4px 0;color:#777">Услуга / Service</td><td style="padding:4px 0"><b>${esc(ctx.service)}</b></td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;color:#777">Мастер / Specialist</td><td style="padding:4px 0"><b>${esc(ctx.master)}</b></td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;color:#777">Когда / When</td><td style="padding:4px 0"><b>${esc(ctx.date)}, ${esc(ctx.time)}</b></td></tr>`,
  ]
  if (ctx.price != null)
    infoRows.push(`<tr><td style="padding:4px 12px 4px 0;color:#777">Стоимость / Price</td><td style="padding:4px 0"><b>${ctx.price} ₾</b></td></tr>`)
  if (ctx.address)
    infoRows.push(`<tr><td style="padding:4px 12px 4px 0;color:#777">Адрес / Address</td><td style="padding:4px 0">${esc(ctx.address)}</td></tr>`)
  void rows
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1c1e">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#3b3b3b;color:#fff;padding:20px 24px;font-size:18px;font-weight:700">${esc(ctx.brand)}</td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px">${esc(title)}</h1>
      <p style="margin:0 0 16px;color:#555;line-height:1.5">${introHtml}</p>
      <table role="presentation" style="font-size:14px;line-height:1.5">${infoRows.join('')}</table>
      ${footer ? `<p style="margin:18px 0 0;color:#888;font-size:13px;line-height:1.5">${footer}</p>` : ''}
    </td></tr>
  </table></body></html>`
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

const T = {
  clientCreated: {
    subject: { ru: 'Запись подтверждена', en: 'Booking confirmed', ka: 'ჯავშანი დადასტურდა' },
    hi: {
      ru: (c) => `Здравствуйте${c.clientName ? ', ' + esc(c.clientName) : ''}! Вы записаны. Ждём вас.`,
      en: (c) => `Hello${c.clientName ? ', ' + esc(c.clientName) : ''}! Your booking is confirmed. See you soon.`,
      ka: (c) => `გამარჯობა${c.clientName ? ', ' + esc(c.clientName) : ''}! თქვენი ჯავშანი დადასტურდა.`,
    },
    foot: {
      ru: 'Если планы изменились — сообщите нам, пожалуйста.',
      en: 'If your plans change, please let us know.',
      ka: 'თუ გეგმები შეიცვალა, გვაცნობეთ.',
    },
  },
  clientReminder: {
    subject: { ru: 'Напоминание о записи через час', en: 'Reminder: your appointment in 1 hour', ka: 'შეხსენება: ჩაწერა ერთ საათში' },
    hi: {
      ru: (c) => `Напоминаем: сегодня в ${esc(c.time.split('–')[0])} вас ждёт ${esc(c.master)}.`,
      en: (c) => `A reminder: today at ${esc(c.time.split('–')[0])} ${esc(c.master)} is waiting for you.`,
      ka: (c) => `შეხსენება: დღეს ${esc(c.time.split('–')[0])}-ზე ${esc(c.master)} გელოდებათ.`,
    },
    foot: { ru: 'До встречи!', en: 'See you soon!', ka: 'შევხვდებით!' },
  },
  clientCancelled: {
    subject: { ru: 'Запись отменена', en: 'Booking cancelled', ka: 'ჯავშანი გაუქმდა' },
    hi: {
      ru: () => `Ваша запись отменена. Если это ошибка — запишитесь заново или свяжитесь с нами.`,
      en: () => `Your booking has been cancelled. If this is a mistake, please book again or contact us.`,
      ka: () => `თქვენი ჯავშანი გაუქმდა. თუ ეს შეცდომაა, დაჯავშნეთ ხელახლა.`,
    },
    foot: { ru: '', en: '', ka: '' },
  },
}

function clientEmail(kind, ctx, lang) {
  const t = T[kind]
  const l = t.subject[lang] ? lang : 'ru'
  return {
    subject: `${t.subject[l]} — ${ctx.brand}`,
    html: layout(t.subject[l], t.hi[l](ctx), ctx, t.foot[l]),
  }
}

// Внутренние письма (сотрудникам и мастеру) — на русском.
function staffCreatedEmail(ctx) {
  const intro = `Новая запись${ctx.clientName ? ` от клиента ${esc(ctx.clientName)}` : ''}.`
  return { subject: `Новая запись — ${ctx.brand}`, html: layout('Новая запись', intro, ctx, contactFoot(ctx)) }
}
function masterCreatedEmail(ctx) {
  const intro = `К вам записались${ctx.clientName ? `: ${esc(ctx.clientName)}` : ''}.`
  return { subject: `Новая запись к вам — ${ctx.brand}`, html: layout('Новая запись к вам', intro, ctx, contactFoot(ctx)) }
}
function masterCancelledEmail(ctx) {
  const intro = `Запись отменена${ctx.clientName ? ` (клиент ${esc(ctx.clientName)})` : ''}.`
  return { subject: `Запись отменена — ${ctx.brand}`, html: layout('Запись отменена', intro, ctx, '') }
}
function contactFoot(ctx) {
  return ctx.clientPhone ? `Телефон клиента: ${esc(ctx.clientPhone)}` : ''
}

// --- Публичные хуки ---

/** При создании записи: письма клиенту, сотрудникам и мастеру. */
export async function notifyBookingCreated(env, data, booking) {
  if (!env || !env.RESEND_API_KEY) return
  const lang = booking.lang || 'ru'
  const ctx = { ...bookingContext(data, booking, lang), clientPhone: booking.clientPhone }
  const ctxRu = { ...bookingContext(data, booking, 'ru'), clientName: booking.clientName, clientPhone: booking.clientPhone }

  const jobs = []
  if (booking.clientEmail) {
    const m = clientEmail('clientCreated', ctx, lang)
    jobs.push(sendEmail(env, { to: booking.clientEmail, subject: m.subject, html: m.html }))
  }
  const staff = staffEmails(data)
  if (staff.length) {
    const m = staffCreatedEmail(ctxRu)
    jobs.push(sendEmail(env, { to: staff, subject: m.subject, html: m.html }))
  }
  const master = masterEmail(data, booking.specialistId)
  if (master) {
    const m = masterCreatedEmail(ctxRu)
    jobs.push(sendEmail(env, { to: master, subject: m.subject, html: m.html }))
  }
  await Promise.all(jobs)
}

/** При отмене записи: письма клиенту и мастеру. */
export async function notifyBookingCancelled(env, data, booking) {
  if (!env || !env.RESEND_API_KEY) return
  const lang = booking.lang || 'ru'
  const ctx = bookingContext(data, booking, lang)
  const ctxRu = { ...bookingContext(data, booking, 'ru'), clientName: booking.clientName }
  const jobs = []
  if (booking.clientEmail) {
    const m = clientEmail('clientCancelled', ctx, lang)
    jobs.push(sendEmail(env, { to: booking.clientEmail, subject: m.subject, html: m.html }))
  }
  const master = masterEmail(data, booking.specialistId)
  if (master) {
    const m = masterCancelledEmail(ctxRu)
    jobs.push(sendEmail(env, { to: master, subject: m.subject, html: m.html }))
  }
  await Promise.all(jobs)
}

/** Отправить напоминание клиенту (вызывается из cron). */
export async function sendReminder(env, data, booking) {
  if (!env || !env.RESEND_API_KEY || !booking.clientEmail) return
  const lang = booking.lang || 'ru'
  const ctx = bookingContext(data, booking, lang)
  const m = clientEmail('clientReminder', ctx, lang)
  await sendEmail(env, { to: booking.clientEmail, subject: m.subject, html: m.html })
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

/** Какие записи «созрели» для напоминания и ещё не были напомнены. */
export function dueReminders(data, nowMs, leadMinutes, tz) {
  const nowWall = studioWallMs(nowMs, tz)
  const lead = (leadMinutes || 60) * 60_000
  return (data.bookings || []).filter((b) => {
    if (b.reminderSentAt || !b.clientEmail) return false
    const startWall = wallMs(b.date, b.start)
    return nowWall >= startWall - lead && nowWall < startWall
  })
}

/**
 * Cron-проход: помечает созревшие записи как «напомнено» (одна запись в хранилище)
 * и шлёт письма. Помечаем ДО отправки — доставка «не более одного раза».
 */
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
