// Чистая логика Worker'а: хэши/пароли, подпись сессий, проверка доступности,
// формирование публичных данных. Никаких обращений к сети — легко тестируется.

// --- base64 (UTF-8 safe) ---

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function base64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// --- Пароли (совпадает с клиентским src/crypto.ts) ---

export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function verifyPassword(password, salt, hash) {
  return (await hashPassword(password, salt)) === hash
}

// --- Сессии (HMAC-SHA256) ---

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return base64url(new Uint8Array(sig))
}

/** Выдать подписанный токен сессии сотрудника. ttlSec — срок жизни. */
export async function signSession(secret, payload, nowMs, ttlSec = 60 * 60 * 12) {
  const body = { ...payload, exp: Math.floor(nowMs / 1000) + ttlSec }
  const p = base64url(new TextEncoder().encode(JSON.stringify(body)))
  const sig = await hmac(secret, p)
  return `${p}.${sig}`
}

/** Проверить токен. Возвращает payload или null. */
export async function verifySession(secret, token, nowMs) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [p, sig] = token.split('.')
  const expected = await hmac(secret, p)
  if (sig !== expected) return null
  try {
    const body = JSON.parse(new TextDecoder().decode(base64urlToBytes(p)))
    if (typeof body.exp !== 'number' || body.exp * 1000 < nowMs) return null
    return body
  } catch {
    return null
  }
}

// --- Время / доступность ---

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export function addMinutes(hhmm, delta) {
  const t = Math.max(0, Math.min(24 * 60, toMin(hhmm) + delta))
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function overlaps(a, b) {
  return toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)
}

/** Свободен ли слот у специалиста под услугу в дату/время (та же логика, что на клиенте). */
export function isSlotFree(data, specialistId, serviceId, date, start) {
  const svc = data.services.find((s) => s.id === serviceId)
  if (!svc) return false
  const sp = data.specialists.find((s) => s.id === specialistId)
  if (!sp || !sp.serviceIds.includes(serviceId)) return false
  const sched = data.schedules.find((s) => s.specialistId === specialistId && s.date === date)
  if (!sched || !sched.windows.length) return false
  const end = addMinutes(start, svc.durationMin)
  const cand = { start, end }
  const inWindow = sched.windows.some((w) => toMin(w.start) <= toMin(start) && toMin(end) <= toMin(w.end))
  if (!inWindow) return false
  const busy = [
    ...(sched.breaks || []),
    ...data.bookings
      .filter((b) => b.specialistId === specialistId && b.date === date)
      .map((b) => ({ start: b.start, end: b.end })),
  ]
  return !busy.some((r) => overlaps(cand, r))
}

// --- Минимальный запас до записи (правило онлайн-записи клиентов) ---

// Стенные (wall-clock) миллисекунды: трактуем дату/время как UTC — сравнивать
// разницу так корректно для зоны без переходов на летнее время (Тбилиси).
function wallMs(date, start) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = start.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, mi)
}

// «Сейчас» по стенным часам салона (по умолчанию Asia/Tbilisi, без DST).
function studioWallMs(nowMs, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const g = (t) => Number(parts.find((p) => p.type === t).value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
}

/** Достаточно ли запаса до начала сеанса, чтобы клиент мог записаться онлайн. */
export function leadOk(minLeadMinutes, date, start, nowMs, tz) {
  if (!minLeadMinutes || minLeadMinutes <= 0) return true
  return wallMs(date, start) - studioWallMs(nowMs, tz) >= minLeadMinutes * 60_000
}

// --- Публичные данные (без персональных данных и учёток) ---

export function toPublic(data) {
  return {
    brand: data.brand,
    settings: data.settings || { minLeadMinutes: 0 },
    services: data.services,
    specialists: (data.specialists || []).map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      role: s.role,
      bio: s.bio,
      avatar: s.avatar,
      serviceIds: s.serviceIds,
    })),
    schedules: data.schedules || [],
    // только занятость по времени — без имени, телефона, услуги и т.п.
    busy: (data.bookings || []).map((b) => ({
      specialistId: b.specialistId,
      date: b.date,
      start: b.start,
      end: b.end,
    })),
    // Отзывы — публичные (витрина показывает их и рейтинг у специалиста).
    reviews: (data.reviews || []).map((r) => ({
      id: r.id,
      specialistId: r.specialistId,
      authorName: r.authorName,
      rating: r.rating,
      text: r.text,
      date: r.date,
      avatar: r.avatar,
    })),
  }
}

/** Учётки без секретов (salt/passwordHash) — их нельзя отдавать в браузер. */
export function stripUserSecrets(users) {
  return (users || []).map((u) => ({
    id: u.id,
    role: u.role,
    username: u.username,
    name: u.name,
    email: u.email,
    specialistId: u.specialistId,
    createdAt: u.createdAt,
  }))
}

export function emptyData() {
  return {
    version: 1,
    users: [],
    brand: { name: 'Массаж-студия', address: '', avatar: null, banner: null },
    settings: { minLeadMinutes: 0 },
    services: [],
    specialists: [],
    schedules: [],
    bookings: [],
    reviews: [],
  }
}

export function uid(nowMs, rnd) {
  return nowMs.toString(36) + Math.floor(rnd * 1e9).toString(36)
}
