// HTTP-роутинг и обработчики API. Зависимости (store, часы, ГСЧ) внедряются —
// это делает логику тестируемой без сети.

import {
  toPublic,
  stripUserSecrets,
  isSlotFree,
  leadOk,
  addMinutes,
  verifyPassword,
  signSession,
  verifySession,
  verifyCancelToken,
  verifyReviewToken,
  uid,
} from './logic.js'
import { notifyBookingCreated, notifyBookingCancelled } from './email.js'

function corsHeaders(env, request) {
  const origin = env.CORS_ORIGIN || request.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status, env, request) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  })
}

async function readSession(request, env, now) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return verifySession(env.SESSION_SECRET, token, now)
}

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/
const RE_TIME = /^\d{2}:\d{2}$/

/**
 * @param {Request} request
 * @param {object} env
 * @param {{store: object, now: () => number, rnd: () => number}} deps
 */
export async function handle(request, env, deps) {
  const { store, now, rnd } = deps
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) })

  // Явная диагностика недонастроенного Worker'а (иначе — невнятная ошибка HMAC).
  if ((path === '/api/auth/login' || path === '/api/data') && !env.SESSION_SECRET) {
    return json({ error: 'Сервер не настроен: не задан секрет SESSION_SECRET' }, 500, env, request)
  }

  try {
    // --- Публичные данные для витрины (без персональных данных) ---
    if (path === '/api/public' && method === 'GET') {
      const { data } = await store.get()
      return json(toPublic(data), 200, env, request)
    }

    // --- Клиент создаёт бронь ---
    if (path === '/api/bookings' && method === 'POST') {
      const b = await request.json().catch(() => null)
      if (!b) return json({ error: 'bad json' }, 400, env, request)
      const { specialistId, serviceId, date, start } = b
      if (!specialistId || !serviceId || !RE_DATE.test(date || '') || !RE_TIME.test(start || ''))
        return json({ error: 'Неверные данные записи' }, 400, env, request)
      if (!b.clientName || !b.clientPhone) return json({ error: 'Укажите имя и телефон' }, 400, env, request)
      if (!b.consent) return json({ error: 'Требуется согласие на обработку данных' }, 400, env, request)

      let created = null
      let failReason = null
      let savedData = null
      await store.update((data) => {
        const svc = data.services.find((s) => s.id === serviceId)
        if (!svc) {
          failReason = 'Услуга не найдена'
          return null
        }
        if (!isSlotFree(data, specialistId, serviceId, date, start)) {
          failReason = 'Это время уже занято'
          return null
        }
        // Правило салона: нельзя записаться слишком близко к началу сеанса.
        const minLead = (data.settings && data.settings.minLeadMinutes) || 0
        if (!leadOk(minLead, date, start, now(), env.STUDIO_TZ)) {
          failReason = 'Онлайн-запись на это время уже закрыта — выберите время попозже'
          return null
        }
        created = {
          id: uid(now(), rnd()),
          specialistId,
          serviceId,
          date,
          start,
          end: addMinutes(start, svc.durationMin),
          status: 'confirmed',
          clientName: String(b.clientName).slice(0, 200),
          clientPhone: String(b.clientPhone).slice(0, 60),
          clientEmail: b.clientEmail ? String(b.clientEmail).slice(0, 200) : undefined,
          comment: b.comment ? String(b.comment).slice(0, 1000) : undefined,
          lang: b.lang === 'en' || b.lang === 'ka' || b.lang === 'ru' ? b.lang : undefined,
          consent: true,
          createdAt: now(),
        }
        data.bookings.push(created)
        savedData = data
        return data
      }, 'booking: new')

      if (!created) return json({ error: failReason || 'Не удалось создать запись' }, 409, env, request)
      // Письма: клиенту, сотрудникам, мастеру (если Resend настроен).
      await notifyBookingCreated(env, savedData, created)
      // Клиенту возвращаем только его запись без чужих данных.
      return json({ ok: true, booking: created }, 200, env, request)
    }

    // --- Админ создаёт запись вручную (только владелец) ---
    if (path === '/api/bookings/create' && method === 'POST') {
      const session = await readSession(request, env, now())
      if (!session) return json({ error: 'Требуется вход' }, 401, env, request)
      if (session.role !== 'owner') return json({ error: 'Недостаточно прав' }, 403, env, request)
      const b = await request.json().catch(() => null)
      if (!b) return json({ error: 'bad json' }, 400, env, request)
      const { specialistId, serviceId, date, start } = b
      if (!specialistId || !serviceId || !RE_DATE.test(date || '') || !RE_TIME.test(start || ''))
        return json({ error: 'Неверные данные записи' }, 400, env, request)

      let created = null
      let failReason = null
      let savedData = null
      await store.update((data) => {
        const svc = data.services.find((s) => s.id === serviceId)
        if (!svc) {
          failReason = 'Услуга не найдена'
          return null
        }
        if (!isSlotFree(data, specialistId, serviceId, date, start)) {
          failReason = 'Это время уже занято'
          return null
        }
        created = {
          id: uid(now(), rnd()),
          specialistId,
          serviceId,
          date,
          start,
          end: addMinutes(start, svc.durationMin),
          status: 'confirmed',
          clientName: b.clientName ? String(b.clientName).slice(0, 200) : undefined,
          clientPhone: b.clientPhone ? String(b.clientPhone).slice(0, 60) : undefined,
          clientEmail: b.clientEmail ? String(b.clientEmail).slice(0, 200) : undefined,
          comment: b.comment ? String(b.comment).slice(0, 1000) : undefined,
          createdAt: now(),
        }
        data.bookings.push(created)
        savedData = data
        return data
      }, 'booking: admin new')

      if (!created) return json({ error: failReason || 'Не удалось создать запись' }, 409, env, request)
      await notifyBookingCreated(env, savedData, created)
      return json({ ok: true, booking: created }, 200, env, request)
    }

    // --- Отмена записи (только владелец). Мягкое удаление: status=cancelled. ---
    if (path === '/api/bookings/cancel' && method === 'POST') {
      const session = await readSession(request, env, now())
      if (!session) return json({ error: 'Требуется вход' }, 401, env, request)
      if (session.role !== 'owner') return json({ error: 'Недостаточно прав' }, 403, env, request)
      const b = await request.json().catch(() => null)
      if (!b || !b.id) return json({ error: 'bad json' }, 400, env, request)

      let removed = null
      let savedData = null
      await store.update((data) => {
        const bk = (data.bookings || []).find((x) => x.id === b.id)
        if (!bk || bk.status === 'cancelled') return null
        bk.status = 'cancelled'
        bk.cancelledAt = now()
        removed = bk
        savedData = data
        return data
      }, 'booking: cancel')

      if (!removed) return json({ error: 'Запись не найдена' }, 404, env, request)
      await notifyBookingCancelled(env, savedData, removed)
      return json({ ok: true }, 200, env, request)
    }

    // --- Клиент открывает запись по ссылке из письма (токен вместо сессии) ---
    if (path === '/api/bookings/lookup' && method === 'GET') {
      const id = url.searchParams.get('id') || ''
      const token = url.searchParams.get('token') || ''
      if (!(await verifyCancelToken(env.SESSION_SECRET, id, token)))
        return json({ error: 'Недействительная ссылка' }, 403, env, request)
      const { data } = await store.get()
      const b = (data.bookings || []).find((x) => x.id === id)
      if (!b) return json({ ok: true, booking: null }, 200, env, request) // уже отменена
      const svc = (data.services || []).find((s) => s.id === b.serviceId)
      const sp = (data.specialists || []).find((s) => s.id === b.specialistId)
      const nm = (v) => (typeof v === 'string' ? v : v ? v.en || v.ru || v.ka || '' : '')
      return json(
        {
          ok: true,
          booking: { id: b.id, date: b.date, start: b.start, end: b.end },
          brand: nm(data.brand && data.brand.name) || 'NEBA',
          address: nm(data.brand && data.brand.address),
          phone: (data.settings && data.settings.phone) || '',
          whatsapp: (data.settings && data.settings.whatsapp) || '',
          service: svc ? nm(svc.name) : '',
          master: sp ? `${nm(sp.firstName)} ${nm(sp.lastName)}`.trim() : '',
        },
        200,
        env,
        request,
      )
    }

    // --- Клиент сам отменяет запись по токену из письма ---
    if (path === '/api/bookings/cancel-public' && method === 'POST') {
      const body = await request.json().catch(() => null)
      const id = body && body.id
      const token = body && body.token
      if (!(await verifyCancelToken(env.SESSION_SECRET, id, token)))
        return json({ error: 'Недействительная ссылка' }, 403, env, request)
      let removed = null
      let savedData = null
      await store.update((data) => {
        const bk = (data.bookings || []).find((x) => x.id === id)
        if (!bk || bk.status === 'cancelled') return null
        bk.status = 'cancelled'
        bk.cancelledAt = now()
        removed = bk
        savedData = data
        return data
      }, 'booking: cancel by client')
      if (!removed) return json({ ok: true, already: true }, 200, env, request)
      await notifyBookingCancelled(env, savedData, removed)
      return json({ ok: true }, 200, env, request)
    }

    // --- Клиент открывает страницу оценки по ссылке из письма (токен) ---
    if (path === '/api/bookings/review-lookup' && method === 'GET') {
      const id = url.searchParams.get('id') || ''
      const token = url.searchParams.get('token') || ''
      if (!(await verifyReviewToken(env.SESSION_SECRET, id, token)))
        return json({ error: 'Недействительная ссылка' }, 403, env, request)
      const { data } = await store.get()
      const b = (data.bookings || []).find((x) => x.id === id)
      const nm = (v) => (typeof v === 'string' ? v : v ? v.en || v.ru || v.ka || '' : '')
      if (!b || b.status === 'cancelled') return json({ ok: true, booking: null }, 200, env, request)
      const svc = (data.services || []).find((s) => s.id === b.serviceId)
      const sp = (data.specialists || []).find((s) => s.id === b.specialistId)
      return json(
        {
          ok: true,
          booking: { id: b.id, date: b.date, start: b.start, end: b.end },
          already: !!b.reviewSubmittedAt,
          brand: nm(data.brand && data.brand.name) || 'NEBA',
          specialistId: b.specialistId,
          specialistAvatar: sp ? sp.avatar || null : null,
          service: svc ? nm(svc.name) : '',
          master: sp ? `${nm(sp.firstName)} ${nm(sp.lastName)}`.trim() : '',
          clientName: b.clientName || '',
        },
        200,
        env,
        request,
      )
    }

    // --- Клиент оставляет оценку специалиста по токену из письма ---
    if (path === '/api/reviews/submit' && method === 'POST') {
      const body = await request.json().catch(() => null)
      const id = body && body.id
      const token = body && body.token
      if (!(await verifyReviewToken(env.SESSION_SECRET, id, token)))
        return json({ error: 'Недействительная ссылка' }, 403, env, request)
      const rating = Math.round(Number(body && body.rating))
      if (!(rating >= 1 && rating <= 5)) return json({ error: 'Поставьте оценку от 1 до 5' }, 400, env, request)

      let result = null
      await store.update((data) => {
        const bk = (data.bookings || []).find((x) => x.id === id)
        if (!bk || bk.status === 'cancelled') {
          result = 'gone'
          return null
        }
        if (bk.reviewSubmittedAt) {
          result = 'already'
          return null
        }
        const authorName = (body.authorName ? String(body.authorName) : bk.clientName || '').slice(0, 200).trim()
        // Дата отзыва — по часам салона (YYYY-MM-DD).
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: env.STUDIO_TZ || 'Asia/Tbilisi',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(now()))
        const review = {
          id: uid(now(), rnd()),
          specialistId: bk.specialistId,
          authorName: authorName || 'Client',
          rating,
          text: body.text ? String(body.text).slice(0, 2000).trim() : '',
          date,
          avatar: null,
          createdAt: now(),
        }
        if (!Array.isArray(data.reviews)) data.reviews = []
        data.reviews.push(review)
        bk.reviewSubmittedAt = now()
        result = 'ok'
        return data
      }, 'review: submit by client')

      if (result === 'gone') return json({ error: 'Запись не найдена' }, 404, env, request)
      if (result === 'already') return json({ ok: true, already: true }, 200, env, request)
      return json({ ok: true }, 200, env, request)
    }

    // --- Вход сотрудника (регистрации/создания владельца через API НЕТ) ---
    if (path === '/api/auth/login' && method === 'POST') {
      const b = await request.json().catch(() => null)
      if (!b || !b.username || !b.password) return json({ error: 'Введите логин и пароль' }, 400, env, request)
      const { data } = await store.get()
      const u = (data.users || []).find(
        (x) => x.username.toLowerCase() === String(b.username).trim().toLowerCase(),
      )
      if (!u || !(await verifyPassword(b.password, u.salt, u.passwordHash)))
        return json({ error: 'Неверный логин или пароль' }, 401, env, request)
      const token = await signSession(env.SESSION_SECRET, { userId: u.id, role: u.role }, now())
      return json(
        { token, user: { id: u.id, name: u.name, role: u.role, specialistId: u.specialistId } },
        200,
        env,
        request,
      )
    }

    // --- Данные для админки (нужна сессия) ---
    if (path === '/api/data' && method === 'GET') {
      const session = await readSession(request, env, now())
      if (!session) return json({ error: 'Требуется вход' }, 401, env, request)
      const { data } = await store.get()
      // Учётки — без секретов.
      return json({ data: { ...data, users: stripUserSecrets(data.users) } }, 200, env, request)
    }

    // --- Сохранение данных из админки (только владелец; сотрудники — просмотр) ---
    if (path === '/api/data' && method === 'PUT') {
      const session = await readSession(request, env, now())
      if (!session) return json({ error: 'Требуется вход' }, 401, env, request)
      if (session.role !== 'owner') return json({ error: 'Недостаточно прав' }, 403, env, request)
      const body = await request.json().catch(() => null)
      const incoming = body && body.data
      if (!incoming) return json({ error: 'bad json' }, 400, env, request)

      await store.update((current) => {
        const next = { ...current }
        next.brand = incoming.brand ?? current.brand
        next.settings = incoming.settings ?? current.settings
        next.services = incoming.services ?? current.services
        next.specialists = incoming.specialists ?? current.specialists
        next.schedules = incoming.schedules ?? current.schedules
        // Записи меняются ТОЛЬКО через выделенные эндпоинты (/api/bookings*),
        // чтобы отправлять письма и не терять брони при перезаписи из админки.
        next.bookings = current.bookings
        next.reviews = incoming.reviews ?? current.reviews

        // Пользователей меняет только суперадминистратор. Секреты (salt/hash)
        // подтягиваем из текущих данных, если браузер их не прислал.
        if (session.role === 'owner' && Array.isArray(incoming.users)) {
          next.users = incoming.users.map((u) => {
            const cur = (current.users || []).find((x) => x.id === u.id)
            return {
              ...u,
              salt: u.salt || cur?.salt,
              passwordHash: u.passwordHash || cur?.passwordHash,
            }
          })
        } else {
          next.users = current.users // не-владелец не трогает учётки
        }
        return next
      }, 'admin: save')

      return json({ ok: true }, 200, env, request)
    }

    return json({ error: 'not found' }, 404, env, request)
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, env, request)
  }
}
