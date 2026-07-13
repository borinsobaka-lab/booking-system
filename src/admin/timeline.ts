// Геометрия вертикального таймлайна дня (общая для расписания и записей).

export const DAY_START_MIN = 8 * 60 // 08:00
export const DAY_END_MIN = 22 * 60 // 22:00
export const PX_PER_MIN = 0.95
export const SNAP_MIN = 15

export const TIMELINE_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN

/** Минуты от полуночи → координата Y (px от верха таймлайна). */
export function minToY(min: number): number {
  return (min - DAY_START_MIN) * PX_PER_MIN
}

/** Y (px) → минуты от полуночи, с привязкой к сетке. */
export function yToMin(y: number, snap = SNAP_MIN): number {
  const raw = DAY_START_MIN + y / PX_PER_MIN
  const snapped = Math.round(raw / snap) * snap
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, snapped))
}

/** Подписи часов для линейки. */
export function hourMarks(): { min: number; label: string }[] {
  const marks: { min: number; label: string }[] = []
  for (let h = DAY_START_MIN / 60; h <= DAY_END_MIN / 60; h++) {
    marks.push({ min: h * 60, label: `${String(h).padStart(2, '0')}:00` })
  }
  return marks
}
