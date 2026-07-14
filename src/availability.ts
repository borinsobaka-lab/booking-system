// Вычисление доступности: свободные слоты для записи с учётом рабочих окон
// специалиста, перерывов и уже существующих записей.

import { getState } from './db'
import { addMinutes, overlaps, toMinutes } from './time'
import type { Booking, DaySchedule, Service, Specialist, TimeRange } from './types'

/** Шаг сетки слотов (минуты). */
export const SLOT_STEP = 30

export interface Slot {
  start: string
  end: string
}

function bookingsFor(specialistId: string, date: string): Booking[] {
  return getState().bookings.filter(
    (b) => b.specialistId === specialistId && b.date === date && b.status !== 'cancelled',
  )
}

/** Занятые интервалы дня: перерывы + существующие записи. */
function busyRanges(sched: DaySchedule | undefined, specialistId: string, date: string): TimeRange[] {
  const breaks = sched?.breaks ?? []
  const booked = bookingsFor(specialistId, date).map((b) => ({ start: b.start, end: b.end }))
  return [...breaks, ...booked]
}

/** Есть ли у специалиста хоть какое-то рабочее окно в этот день. */
export function isWorkingDay(specialistId: string, date: string): boolean {
  const sched = getState().schedules.find((s) => s.specialistId === specialistId && s.date === date)
  return !!sched && sched.windows.length > 0
}

/**
 * Свободные слоты начала для услуги длительностью duration у специалиста в день.
 * Слот подходит, если [start, start+duration] целиком внутри рабочего окна и не
 * пересекается ни с перерывами, ни с записями.
 */
export function freeSlots(specialistId: string, date: string, durationMin: number): Slot[] {
  const state = getState()
  const sched = state.schedules.find((s) => s.specialistId === specialistId && s.date === date)
  if (!sched || sched.windows.length === 0) return []

  const busy = busyRanges(sched, specialistId, date)
  const slots: Slot[] = []

  for (const win of sched.windows) {
    const winStart = toMinutes(win.start)
    const winEnd = toMinutes(win.end)
    for (let t = winStart; t + durationMin <= winEnd; t += SLOT_STEP) {
      const candidate: TimeRange = { start: minToStr(t), end: minToStr(t + durationMin) }
      const clash = busy.some((r) => overlaps(candidate, r))
      if (!clash) slots.push({ start: candidate.start, end: candidate.end })
    }
  }
  return slots
}

function minToStr(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Свободен ли конкретный старт (для проверки перед созданием записи). */
export function isSlotFree(specialistId: string, date: string, start: string, durationMin: number): boolean {
  const candidate = { start, end: addMinutes(start, durationMin) }
  return freeSlots(specialistId, date, durationMin).some((s) => s.start === candidate.start)
}

/** Специалисты, которые выполняют услугу и свободны в дату/время. */
export function availableSpecialistsAt(
  serviceId: string,
  date: string,
  start: string,
): Specialist[] {
  const state = getState()
  const service = state.services.find((s) => s.id === serviceId)
  if (!service) return []
  return state.specialists.filter(
    (sp) => sp.serviceIds.includes(serviceId) && isSlotFree(sp.id, date, start, service.durationMin),
  )
}

/** Специалисты, выполняющие услугу (без учёта времени). */
export function specialistsForService(serviceId: string): Specialist[] {
  return getState().specialists.filter((sp) => sp.serviceIds.includes(serviceId))
}

/** Услуги, которые выполняет специалист. */
export function servicesForSpecialist(specialistId: string): Service[] {
  const state = getState()
  const sp = state.specialists.find((s) => s.id === specialistId)
  if (!sp) return []
  return state.services.filter((s) => sp.serviceIds.includes(s.id))
}

/**
 * Есть ли хоть один свободный слот в этот день у любого специалиста, умеющего
 * услугу (для пути «дата → услуга» и подсветки доступных дней).
 */
export function dayHasAnyFreeSlot(date: string, serviceId?: string): boolean {
  const state = getState()
  const services = serviceId ? state.services.filter((s) => s.id === serviceId) : state.services
  for (const sp of state.specialists) {
    for (const svc of services) {
      if (!sp.serviceIds.includes(svc.id)) continue
      if (freeSlots(sp.id, date, svc.durationMin).length > 0) return true
    }
  }
  return false
}

/**
 * Объединённые свободные времена начала на дату среди всех специалистов для
 * услуги (путь «дата → услуга → специалист»). Возвращает отсортированный
 * уникальный список 'HH:MM'.
 */
export function unionFreeStartsForService(date: string, serviceId: string): string[] {
  const service = getState().services.find((s) => s.id === serviceId)
  if (!service) return []
  const set = new Set<string>()
  for (const sp of specialistsForService(serviceId)) {
    for (const slot of freeSlots(sp.id, date, service.durationMin)) set.add(slot.start)
  }
  return [...set].sort()
}
