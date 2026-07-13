// Работа со временем и датами. Всё в локальном времени салона (без часовых поясов):
// дата — строка 'YYYY-MM-DD', время — 'HH:MM'.

import type { TimeRange } from './types'

/** 'HH:MM' → минуты от полуночи. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Минуты от полуночи → 'HH:MM'. */
export function fromMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Прибавить минуты к 'HH:MM'. */
export function addMinutes(hhmm: string, delta: number): string {
  return fromMinutes(toMinutes(hhmm) + delta)
}

/** Пересекаются ли два интервала (открытые концы не считаются пересечением). */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
}

/** Локальная дата → 'YYYY-MM-DD'. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' → Date (полночь локально). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Сегодня в формате 'YYYY-MM-DD'. */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** Прибавить дни к ключу даты. */
export function addDays(key: string, days: number): string {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

export function weekdayShort(key: string): string {
  return WEEKDAYS[fromDateKey(key).getDay()]
}

export function weekdayLong(key: string): string {
  return WEEKDAYS_FULL[fromDateKey(key).getDay()]
}

/** Например «13 июля». */
export function formatDayMonth(key: string): string {
  const d = fromDateKey(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Например «Понедельник, 13 июля». */
export function formatFull(key: string): string {
  return `${weekdayLong(key)}, ${formatDayMonth(key)}`
}

/** Начало недели (понедельник) для даты. */
export function startOfWeek(key: string): string {
  const d = fromDateKey(key)
  const dow = (d.getDay() + 6) % 7 // 0 = понедельник
  return addDays(key, -dow)
}

/** Массив из 7 ключей дат начиная с monday. */
export function weekDays(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i))
}
