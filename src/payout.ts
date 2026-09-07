// Выплата массажисту за проведённый сеанс. Ставка общая по студии, но у
// конкретного мастера может быть своя — она перебивает общую.

import type { DB } from './types'

/** Ставка по умолчанию, если ничего не задано (₾ за сеанс). */
export const DEFAULT_PAYOUT = 40

/** Сколько платим этому мастеру за один сеанс. */
export function payoutRate(db: DB, specialistId: string): number {
  const own = db.specialists.find((s) => s.id === specialistId)?.payoutPerSession
  if (typeof own === 'number' && own >= 0) return own
  return db.settings.payoutPerSession ?? DEFAULT_PAYOUT
}
