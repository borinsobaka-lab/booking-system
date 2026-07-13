// HTTP-роутинг и обработчики API. Зависимости (store, часы, ГСЧ) внедряются —
// это делает логику тестируемой без сети.

import {
  toPublic,
  stripUserSecrets,
  isSlotFree,
  addMinutes,
  verifyPassword,
  signSession,
  verifySession,
  uid,
} from './logic.js'

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
          clientName: String(b.clientName).slice(0, 200),
          clientPhone: String(b.clientPhone).slice(0, 60),
          clientEmail: b.clientEmail ? String(b.clientEmail).slice(0, 200) : undefined,
          comment: b.comment ? String(b.comment).slice(0, 1000) : undefined,
          consent: true,
          createdAt: now(),
        }
        data.bookings.push(created)
        return data
      }, 'booking: new')

      if (!created) return json({ error: failReason || 'Не удалось создать запись' }, 409, env, request)
      // Клиенту возвращаем только его запись без чужих данных.
      return json({ ok: true, booking: created }, 200, env, request)
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

    // --- Сохранение данных из админки ---
    if (path === '/api/data' && method === 'PUT') {
      const session = await readSession(request, env, now())
      if (!session) return json({ error: 'Требуется вход' }, 401, env, request)
      const body = await request.json().catch(() => null)
      const incoming = body && body.data
      if (!incoming) return json({ error: 'bad json' }, 400, env, request)

      await store.update((current) => {
        const next = { ...current }
        next.brand = incoming.brand ?? current.brand
        next.services = incoming.services ?? current.services
        next.specialists = incoming.specialists ?? current.specialists
        next.schedules = incoming.schedules ?? current.schedules
        next.bookings = incoming.bookings ?? current.bookings

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
