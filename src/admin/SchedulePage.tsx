import { useState } from 'react'
import { useDB, setDaySchedule, getDaySchedule } from '../db'
import { Avatar, Modal } from '../ui'
import { toMinutes, startOfWeek, weekDays, todayKey, addDays, weekdayShort, formatDayMonth } from '../time'
import { PX_PER_MIN, TIMELINE_HEIGHT, hourMarks, minToY } from './timeline'
import { pick, specialistName } from '../localized'
import { Icon } from '../icons'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import type { DaySchedule, Lang, TimeRange } from '../types'

const A: Lang = 'ru' // отображение контента в админке

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

export function SchedulePage() {
  const db = useDB()
  const { canManage } = useAuth()
  const [deny, denyModal] = useDeny()
  const [specId, setSpecId] = useState<string>(db.specialists[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey()))
  const [editDate, setEditDate] = useState<string | null>(null)

  const spec = db.specialists.find((s) => s.id === specId)
  const days = weekDays(weekStart)

  if (db.specialists.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Расписание</h1>
        </header>
        <div className="empty">
          <div className="empty-emoji"><Icon name="calendarClock" size={44} /></div>
          <p>Сначала добавьте специалистов — тогда им можно будет задать расписание.</p>
        </div>
      </div>
    )
  }

  const openDay = (date: string) => (canManage ? setEditDate(date) : deny())

  return (
    <div className="page">
      <header className="page-head">
        <h1>Расписание</h1>
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
        Нажмите «＋ время» в колонке дня, чтобы задать рабочие часы и перерывы. На таймлайне — только
        просмотр: рабочее время, перерывы и записи клиентов.
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
            const bookings = spec
              ? db.bookings.filter(
                  (b) => b.specialistId === spec.id && b.date === date && b.status !== 'cancelled',
                )
              : []
            return (
              <div key={date} className={`tl-day${isToday ? ' today' : ''}`}>
                <div className="tl-day-head">
                  <div className="tl-day-name">
                    {weekdayShort(date)} <span className="muted">{formatDayMonth(date)}</span>
                  </div>
                  <div className="tl-day-headrow">
                    <span className={`tl-day-status ${working ? 'work' : 'off'}`}>
                      {working ? 'рабочий' : 'выходной'}
                    </span>
                    <button className="tl-add" onClick={() => openDay(date)} title="Задать время">
                      ＋ время
                    </button>
                  </div>
                </div>
                <div className="tl-col tl-col-view" style={{ height: TIMELINE_HEIGHT }}>
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
                    </div>
                  ))}

                  {/* записи клиентов (только показ; отменённые не показываем) */}
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
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editDate && spec && (
        <DayEditor specialistId={spec.id} date={editDate} onClose={() => setEditDate(null)} />
      )}
      {denyModal}
    </div>
  )
}

/** Модальное окно: задать рабочие часы и перерывы для конкретного дня. */
function DayEditor({ specialistId, date, onClose }: { specialistId: string; date: string; onClose: () => void }) {
  const db = useDB()
  const sched = db.schedules.find((s) => s.specialistId === specialistId && s.date === date)
  const windows = sched?.windows ?? []
  const breaks = sched?.breaks ?? []

  const [type, setType] = useState<'work' | 'break'>('work')
  const [from, setFrom] = useState('10:00')
  const [to, setTo] = useState('18:00')

  const base = (): DaySchedule => sched ?? { specialistId, date, windows: [], breaks: [] }

  const add = () => {
    if (toMinutes(to) - toMinutes(from) < 15) {
      alert('Конец должен быть позже начала (минимум 15 минут).')
      return
    }
    const range: TimeRange = { start: from, end: to }
    const b = base()
    if (type === 'work') setDaySchedule({ ...b, windows: mergeRanges([...b.windows, range]) })
    else setDaySchedule({ ...b, breaks: mergeRanges([...b.breaks, range]) })
  }

  const removeWindow = (i: number) => setDaySchedule({ ...base(), windows: windows.filter((_, x) => x !== i) })
  const removeBreak = (i: number) => setDaySchedule({ ...base(), breaks: breaks.filter((_, x) => x !== i) })
  const clearDay = () => {
    if (confirm('Очистить весь день?')) setDaySchedule({ specialistId, date, windows: [], breaks: [] })
  }

  const setPreset = (t: 'work' | 'break') => {
    setType(t)
    if (t === 'break') {
      setFrom('13:00')
      setTo('14:00')
    } else {
      setFrom('10:00')
      setTo('18:00')
    }
  }

  const empty = windows.length === 0 && breaks.length === 0

  return (
    <Modal title={`${weekdayShort(date)}, ${formatDayMonth(date)}`} onClose={onClose}>
      <div className="form day-editor">
        <div className="field">
          <span className="field-label">Что добавить</span>
          <div className="segmented">
            <button className={type === 'work' ? 'active' : ''} onClick={() => setPreset('work')}>
              <span className="swatch swatch-work" /> Рабочее время
            </button>
            <button className={type === 'break' ? 'active' : ''} onClick={() => setPreset('break')}>
              <span className="swatch swatch-break" /> Перерыв
            </button>
          </div>
        </div>

        <div className="time-row">
          <label className="field">
            <span className="field-label">С</span>
            <input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">До</span>
            <input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary time-add" onClick={add}>
            Добавить
          </button>
        </div>

        <div className="day-lists">
          {empty ? (
            <p className="muted small">Пока ничего не задано — это выходной.</p>
          ) : (
            <>
              {windows.map((w, i) => (
                <div className="day-interval" key={`w${i}`}>
                  <span className="swatch swatch-work" />
                  <span className="di-label">Рабочее время</span>
                  <b>{w.start}–{w.end}</b>
                  <button className="linkbtn danger" onClick={() => removeWindow(i)}>
                    Удалить
                  </button>
                </div>
              ))}
              {breaks.map((b, i) => (
                <div className="day-interval" key={`b${i}`}>
                  <span className="swatch swatch-break" />
                  <span className="di-label">Перерыв</span>
                  <b>{b.start}–{b.end}</b>
                  <button className="linkbtn danger" onClick={() => removeBreak(i)}>
                    Удалить
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="form-actions">
          <button className="linkbtn danger" onClick={clearDay} disabled={empty}>
            Очистить день
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  )
}
