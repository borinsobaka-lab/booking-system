// Помощники для клиентских путей записи: какие услуги/специалисты/дни/времена
// доступны при текущем частичном выборе.

import { getState } from '../db'
import { freeSlots, isSlotFree } from '../availability'
import { addDays, todayKey } from '../time'
import type { Service, Specialist } from '../types'

export interface Selection {
  serviceId?: string
  specialistId?: string
  date?: string
  start?: string
}

function services(): Service[] {
  return getState().services
}
function specialists(): Specialist[] {
  return getState().specialists
}

/** Специалисты, выполняющие услугу. */
export function specialistsDoing(serviceId: string): Specialist[] {
  return specialists().filter((sp) => sp.serviceIds.includes(serviceId))
}

/** Услуги, которые выполняет специалист. */
export function servicesOf(specialistId: string): Service[] {
  const sp = specialists().find((s) => s.id === specialistId)
  if (!sp) return []
  return services().filter((s) => sp.serviceIds.includes(s.id))
}

/** Есть ли доступность в этот день при известных ограничениях (услуга/специалист). */
export function dayAvailable(date: string, sel: Selection): boolean {
  const svcs = sel.serviceId ? services().filter((s) => s.id === sel.serviceId) : services()
  const specs = sel.specialistId ? specialists().filter((s) => s.id === sel.specialistId) : specialists()
  for (const sp of specs) {
    for (const svc of svcs) {
      if (!sp.serviceIds.includes(svc.id)) continue
      if (freeSlots(sp.id, date, svc.durationMin).length > 0) return true
    }
  }
  return false
}

/** Доступные времена начала на дату при известных ограничениях. */
export function startsFor(date: string, sel: Selection): string[] {
  const svcs = sel.serviceId ? services().filter((s) => s.id === sel.serviceId) : services()
  const specs = sel.specialistId ? specialists().filter((s) => s.id === sel.specialistId) : specialists()
  const set = new Set<string>()
  for (const sp of specs) {
    for (const svc of svcs) {
      if (!sp.serviceIds.includes(svc.id)) continue
      for (const slot of freeSlots(sp.id, date, svc.durationMin)) set.add(slot.start)
    }
  }
  return [...set].sort()
}

/** Услуги, на которые можно записаться в конкретные дату и время (есть свободный специалист). */
export function servicesBookableAt(date: string, start: string): Service[] {
  return services().filter((svc) =>
    specialistsDoing(svc.id).some((sp) => isSlotFree(sp.id, date, start, svc.durationMin)),
  )
}

/** Текущее время 'HH:MM' (для отсечения прошедших слотов на сегодня). */
function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Ближайшие свободные слоты специалиста для показа на карточке.
 * Длительность: выбранной услуги (если известна), иначе максимальная среди
 * услуг мастера — тогда слот гарантированно подойдёт под любую выбранную позже.
 * Прошедшие сегодняшние времена отсекаются.
 */
export function nearestSlots(
  specialistId: string,
  serviceId: string | undefined,
  count = 5,
  horizonDays = 30,
): { date: string; starts: string[] } | null {
  const state = getState()
  const sp = state.specialists.find((s) => s.id === specialistId)
  if (!sp) return null
  let duration: number
  if (serviceId) {
    const svc = state.services.find((s) => s.id === serviceId)
    if (!svc) return null
    duration = svc.durationMin
  } else {
    const durs = state.services.filter((s) => sp.serviceIds.includes(s.id)).map((s) => s.durationMin)
    if (durs.length === 0) return null
    duration = Math.max(...durs)
  }
  const today = todayKey()
  const now = nowHHMM()
  let day = today
  for (let i = 0; i < horizonDays; i++) {
    let starts = freeSlots(specialistId, day, duration).map((s) => s.start)
    if (day === today) starts = starts.filter((s) => s > now)
    if (starts.length) return { date: day, starts: starts.slice(0, count) }
    day = addDays(day, 1)
  }
  return null
}

/** Свободен ли специалист под услугу в конкретные дату/время. */
export function specialistFreeAt(specialistId: string, serviceId: string, date: string, start: string): boolean {
  const svc = services().find((s) => s.id === serviceId)
  if (!svc) return false
  const sp = specialists().find((s) => s.id === specialistId)
  if (!sp || !sp.serviceIds.includes(serviceId)) return false
  return isSlotFree(specialistId, date, start, svc.durationMin)
}
