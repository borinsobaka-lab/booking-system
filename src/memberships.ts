// Абонементы: кто из клиентов ходит «по абонементу» и сколько визитов осталось.
//
// Главное правило: остаток НЕ хранится отдельным счётчиком, который можно
// случайно «уронить». Визит считается потраченным, когда к абонементу привязана
// подтверждённая запись (`Booking.membershipId`). Отменили запись — визит
// вернулся сам собой. `Membership.used` — это тот же счёт, посчитанный здесь и
// сохранённый, чтобы его видели и те, кому сервер отдаёт записи не целиком
// (массажист видит только свои).
//
// Ровно те же правила продублированы на сервере — worker/src/logic.js
// (`applyMemberships`), там же на них есть тесты. Меняете правило — меняйте в
// обоих местах.

import { phoneKey } from './clients'
import type { Booking, DB, Membership } from './types'

export { phoneKey }

const byTime = (a: Booking, b: Booking) =>
  a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.start < b.start ? -1 : a.start > b.start ? 1 : 0

/**
 * Пересчитать привязку записей к абонементам и остаток по каждому.
 *
 * - абонементы тратятся по очереди оформления (сначала тот, что старше);
 * - прошедшие визиты по абонементу уже потрачены — их не пересматриваем;
 * - будущие записи клиента занимают оставшиеся визиты по порядку времени;
 * - отменённая запись визит не тратит — баланс возвращается сам;
 * - запись, с которой метку сняли вручную, автоматика не трогает;
 * - записи раньше даты начала абонемента автоматически не помечаются
 *   (их можно привязать вручную в «Записях»).
 *
 * @param today ключ сегодняшней даты 'YYYY-MM-DD' (по часам салона).
 */
export function applyMemberships(db: DB, today: string): void {
  const memberships = db.memberships ?? []
  const bookings = db.bookings ?? []
  const byId = new Map(memberships.map((m) => [m.id, m]))

  // Абонемент удалили или у него сменился телефон — отвязываем записи.
  // У прошедших визитов метку оставляем: они правда состоялись по абонементу,
  // переписывать историю (и суммы к оплате) задним числом не будем.
  for (const b of bookings) {
    if (!b.membershipId) continue
    // Телефона не видно (массажисту чужие записи приходят обезличенными) —
    // привязку не трогаем, иначе метка пропала бы у него на экране.
    if (!b.clientPhone) continue
    const m = byId.get(b.membershipId)
    if (m && phoneKey(m.clientPhone) === phoneKey(b.clientPhone)) continue
    b.membershipId = undefined
    if (b.date >= today) b.membership = undefined
  }

  const taken = new Set<string>()
  for (const m of [...memberships].sort((a, b) => a.createdAt - b.createdAt)) {
    const key = phoneKey(m.clientPhone)
    const total = Math.max(0, Math.floor(m.total) || 0)
    const mine = key
      ? bookings.filter((b) => b.status !== 'cancelled' && phoneKey(b.clientPhone) === key)
      : []

    const spent = mine.filter((b) => b.membershipId === m.id && b.date < today)
    for (const b of spent) taken.add(b.id)

    const ahead = mine
      .filter(
        (b) =>
          b.date >= today &&
          !taken.has(b.id) &&
          !b.membershipOptOut &&
          (b.membershipId === m.id || (!b.membershipId && b.date >= m.startDate)),
      )
      .sort(byTime)

    const free = Math.max(0, total - spent.length)
    ahead.forEach((b, i) => {
      if (i < free) {
        b.membershipId = m.id
        b.membership = true
        taken.add(b.id)
      } else if (b.membershipId === m.id) {
        // Визитов не хватило (абонемент урезали) — запись снова обычная.
        b.membershipId = undefined
        b.membership = undefined
      }
    })

    m.used = spent.length + Math.min(ahead.length, free)
  }
}

/** Сколько визитов осталось. */
export function leftOf(m: Membership): number {
  return Math.max(0, (m.total || 0) - (m.used || 0))
}

/** Абонемент клиента с этим телефоном, у которого ещё есть визиты (самый старый). */
export function membershipForPhone(memberships: Membership[], phone: string | undefined): Membership | undefined {
  const key = phoneKey(phone)
  if (!key) return undefined
  return [...memberships]
    .sort((a, b) => a.createdAt - b.createdAt)
    .find((m) => phoneKey(m.clientPhone) === key && leftOf(m) > 0)
}
