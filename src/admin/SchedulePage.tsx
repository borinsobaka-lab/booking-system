import { useRef, useState } from 'react'
import { useDB, setDaySchedule, getDaySchedule } from '../db'
import { Avatar } from '../ui'
import { fromMinutes, toMinutes, startOfWeek, weekDays, todayKey, addDays, weekdayShort, formatDayMonth } from '../time'
import { DAY_END_MIN, DAY_START_MIN, PX_PER_MIN, TIMELINE_HEIGHT, hourMarks, minToY, yToMin } from './timeline'
import { pick, specialistName } from '../localized'
import type { DaySchedule, Lang, TimeRange } from '../types'

const A: Lang = 'ru' // отображение контента в админке

type Mode = 'work' | 'break'

/** Слить перекрывающиеся/смежные интервалы. */
function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  const out: TimeRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && toMinutes(r.start) <= toMinutes(last.end)) {
      if (toMinutes(r.end) > toMinutes(last.end)) last.end = r.end
    } else {
      out.push({ ...r })
    }
  }
  return out
}

interface Draft {
  date: string
  fromMin: number
  toMin: number
}

export function SchedulePage() {
  const db = useDB()
  const [specId, setSpecId] = useState<string>(db.specialists[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey()))
  const [mode, setMode] = useState<Mode>('work')
  const [draft, setDraft] = useState<Draft | null>(null)
  const drawing = useRef<{ date: string; anchorMin: number } | null>(null)

  const spec = db.specialists.find((s) => s.id === specId)
  const days = weekDays(weekStart)

  if (db.specialists.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Расписание</h1>
        </header>
        <div className="empty">
          <div className="empty-emoji">🗓️</div>
          <p>Сначала добавьте специалистов — тогда им можно будет задать расписание.</p>
        </div>
      </div>
    )
  }

  const commitDraft = () => {
    const d = draft
    drawing.current = null
    setDraft(null)
    if (!d || !spec) return
    const from = Math.min(d.fromMin, d.toMin)
    const to = Math.max(d.fromMin, d.toMin)
    if (to - from < 15) return
    const existing =
      getDaySchedule(spec.id, d.date) ?? ({ specialistId: spec.id, date: d.date, windows: [], breaks: [] } as DaySchedule)
    const range: TimeRange = { start: fromMinutes(from), end: fromMinutes(to) }
    const next: DaySchedule =
      mode === 'work'
        ? { ...existing, windows: mergeRanges([...existing.windows, range]) }
        : { ...existing, breaks: mergeRanges([...existing.breaks, range]) }
    setDaySchedule(next)
  }

  const onPointerDown = (date: string, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tl-block')) return // клик по блоку — не рисуем
    const rect = e.currentTarget.getBoundingClientRect()
    const min = yToMin(e.clientY - rect.top)
    drawing.current = { date, anchorMin: min }
    setDraft({ date, fromMin: min, toMin: min })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const dr = drawing.current
    if (!dr) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = yToMin(e.clientY - rect.top)
    setDraft({ date: dr.date, fromMin: dr.anchorMin, toMin: min })
  }

  const removeWindow = (date: string, idx: number) => {
    if (!spec) return
    const s = getDaySchedule(spec.id, date)
    if (!s) return
    setDaySchedule({ ...s, windows: s.windows.filter((_, i) => i !== idx) })
  }
  const removeBreak = (date: string, idx: number) => {
    if (!spec) return
    const s = getDaySchedule(spec.id, date)
    if (!s) return
    setDaySchedule({ ...s, breaks: s.breaks.filter((_, i) => i !== idx) })
  }
  const clearDay = (date: string) => {
    if (!spec) return
    setDaySchedule({ specialistId: spec.id, date, windows: [], breaks: [] })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Расписание</h1>
        <div className="mode-toggle">
          <span className="muted small">Рисуем:</span>
          <div className="segmented">
            <button className={mode === 'work' ? 'active' : ''} onClick={() => setMode('work')}>
              🟩 Рабочее время
            </button>
            <button className={mode === 'break' ? 'active' : ''} onClick={() => setMode('break')}>
              🟧 Перерыв
            </button>
          </div>
        </div>
      </header>

      <div className="sched-controls">
        <div className="spec-picker">
          {db.specialists.map((s) => (
            <button
              key={s.id}
              className={`spec-pill${s.id === specId ? ' active' : ''}`}
              onClick={() => setSpecId(s.id)}
            >
              <Avatar src={s.avatar} name={specialistName(s, A)} size={26} />
              <span>{specialistName(s, A)}</span>
            </button>
          ))}
        </div>
        <div className="week-nav">
          <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ‹
          </button>
          <button className="btn btn-sm" onClick={() => setWeekStart(startOfWeek(todayKey()))}>
            Эта неделя
          </button>
          <button className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            ›
          </button>
        </div>
      </div>

      <p className="muted small hint-line">
        Проведите вниз по колонке дня, чтобы задать {mode === 'work' ? 'рабочие часы' : 'перерыв'} (на телефоне —
        пальцем). Нажмите ✕ на блоке, чтобы удалить. Дни листаются свайпом в сторону.
      </p>

      <div className="timeline">
        <div className="tl-ruler" style={{ height: TIMELINE_HEIGHT }}>
          {hourMarks().map((m) => (
            <div key={m.min} className="tl-hour" style={{ top: minToY(m.min) }}>
              <span>{m.label}</span>
            </div>
          ))}
        </div>

        <div className="tl-days">
          {days.map((date) => {
            const s = spec ? getDaySchedule(spec.id, date) : undefined
            const isToday = date === todayKey()
            const working = !!s && s.windows.length > 0
            const bookings = spec ? db.bookings.filter((b) => b.specialistId === spec.id && b.date === date) : []
            return (
              <div key={date} className={`tl-day${isToday ? ' today' : ''}`}>
                <div className="tl-day-head">
                  <div className="tl-day-name">
                    {weekdayShort(date)} <span className="muted">{formatDayMonth(date)}</span>
                  </div>
                  <div className={`tl-day-status ${working ? 'work' : 'off'}`}>
                    {working ? 'рабочий' : 'выходной'}
                    {(s?.windows.length || s?.breaks.length) ? (
                      <button className="tl-clear" title="Очистить день" onClick={() => clearDay(date)}>
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
                <div
                  className="tl-col"
                  style={{ height: TIMELINE_HEIGHT }}
                  onPointerDown={(e) => onPointerDown(date, e)}
                  onPointerMove={onPointerMove}
                  onPointerUp={commitDraft}
                  onPointerCancel={commitDraft}
                >
                  {/* фоновая сетка часов */}
                  {hourMarks().map((m) => (
                    <div key={m.min} className="tl-gridline" style={{ top: minToY(m.min) }} />
                  ))}

                  {/* рабочие окна */}
                  {s?.windows.map((w, i) => (
                    <div
                      key={`w${i}`}
                      className="tl-block tl-work"
                      style={{ top: minToY(toMinutes(w.start)), height: (toMinutes(w.end) - toMinutes(w.start)) * PX_PER_MIN }}
                    >
                      <span className="tl-block-label">
                        {w.start}–{w.end}
                      </span>
                      <button className="tl-del" onClick={() => removeWindow(date, i)} title="Удалить">
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* перерывы */}
                  {s?.breaks.map((b, i) => (
                    <div
                      key={`b${i}`}
                      className="tl-block tl-break"
                      style={{ top: minToY(toMinutes(b.start)), height: (toMinutes(b.end) - toMinutes(b.start)) * PX_PER_MIN }}
                    >
                      <span className="tl-block-label">перерыв {b.start}–{b.end}</span>
                      <button className="tl-del" onClick={() => removeBreak(date, i)} title="Удалить">
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* записи клиентов (только показ) */}
                  {bookings.map((bk) => (
                    <div
                      key={bk.id}
                      className="tl-block tl-booking"
                      style={{ top: minToY(toMinutes(bk.start)), height: (toMinutes(bk.end) - toMinutes(bk.start)) * PX_PER_MIN }}
                      title="Запись клиента"
                    >
                      <span className="tl-block-label">
                        {bk.start} · {(() => { const svc = db.services.find((x) => x.id === bk.serviceId); return svc ? pick(svc.name, A) : 'услуга' })()}
                      </span>
                    </div>
                  ))}

                  {/* черновик текущего рисования */}
                  {draft && draft.date === date && (
                    <div
                      className={`tl-block tl-draft ${mode === 'work' ? 'tl-work' : 'tl-break'}`}
                      style={{
                        top: minToY(Math.min(draft.fromMin, draft.toMin)),
                        height: Math.max(2, Math.abs(draft.toMin - draft.fromMin) * PX_PER_MIN),
                      }}
                    >
                      <span className="tl-block-label">
                        {fromMinutes(Math.min(draft.fromMin, draft.toMin))}–{fromMinutes(Math.max(draft.fromMin, draft.toMin))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
