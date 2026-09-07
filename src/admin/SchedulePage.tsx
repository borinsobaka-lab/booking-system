import { useState } from 'react'
import { useDB, setDaySchedule, setDaySchedules, getDaySchedule, getState } from '../db'
import { Avatar, Field, Modal } from '../ui'
import { toMinutes, startOfWeek, weekDays, todayKey, addDays, weekdayShort, formatDayMonth } from '../time'
import { PX_PER_MIN, TIMELINE_HEIGHT, hourMarks, minToY } from './timeline'
import { othersBookings, roomBusyAt, roomCount } from '../availability'
import { pick, specialistName } from '../localized'
import { Icon } from '../icons'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import type { DaySchedule, Lang, TimeRange } from '../types'

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

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
  const { canManageSchedule } = useAuth()
  const [deny, denyModal] = useDeny()
  const [specId, setSpecId] = useState<string>(db.specialists[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey()))
  const [editDate, setEditDate] = useState<string | null>(null)
  const [weekEditor, setWeekEditor] = useState(false)

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

  const openDay = (date: string) => (canManageSchedule ? setEditDate(date) : deny())
  const openWeek = () => (canManageSchedule ? setWeekEditor(true) : deny())

  /** Скопировать расписание этого мастера с прошлой недели на показанную. */
  const copyPrevWeek = () => {
    if (!canManageSchedule) return deny()
    if (!spec) return
    const src = weekDays(addDays(weekStart, -7))
    const state = getState()
    const next: DaySchedule[] = days.map((date, i) => {
      const from = state.schedules.find((s) => s.specialistId === spec.id && s.date === src[i])
      return {
        specialistId: spec.id,
        date,
        windows: from ? from.windows.map((w) => ({ ...w })) : [],
        breaks: from ? from.breaks.map((b) => ({ ...b })) : [],
      }
    })
    if (next.every((d) => d.windows.length === 0 && d.breaks.length === 0)) {
      alert('На прошлой неделе у этого мастера ничего не задано — копировать нечего.')
      return
    }
    if (!confirm(`Скопировать прошлую неделю на показанную для «${specialistName(spec, A)}»? Текущие дни недели будут заменены.`)) return
    setDaySchedules(next)
  }

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

      <div className="sched-bulk">
        <button className="btn btn-sm btn-primary" onClick={openWeek}>
          Рабочие дни и время на неделю
        </button>
        <button className="btn btn-sm" onClick={copyPrevWeek}>
          Скопировать прошлую неделю
        </button>
      </div>

      <p className="muted small hint-line">
        Задайте рабочие дни и часы сразу на неделю или поправьте отдельный день кнопкой «＋ время».
        На таймлайне — только просмотр: рабочее время, перерывы и записи клиентов.
        {roomCount() === 1 && db.specialists.length > 1 &&
          ' Серым отмечено время, когда кабинет занят другим мастером — записать в это время нельзя.'}
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

                  {/* кабинет занят другим мастером — сюда записать нельзя */}
                  {spec &&
                    othersBookings(spec.id, date)
                      .filter((bk) => roomBusyAt(spec.id, date, { start: bk.start, end: bk.end }))
                      .map((bk) => (
                        <div
                          key={`o${bk.id}`}
                          className="tl-block tl-roombusy"
                          style={{ top: minToY(toMinutes(bk.start)), height: (toMinutes(bk.end) - toMinutes(bk.start)) * PX_PER_MIN }}
                          title="Кабинет занят другим мастером"
                        >
                          <span className="tl-block-label">кабинет занят</span>
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
      {weekEditor && spec && (
        <WeekEditor specialistId={spec.id} weekStart={weekStart} onClose={() => setWeekEditor(false)} />
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

/** Рабочие дни и часы сразу на неделю: отмечаем дни недели и задаём время.
 *  Отмеченные дни получают одно рабочее окно (и, если нужно, перерыв),
 *  неотмеченные становятся выходными. Так расписание каждого мастера
 *  задаётся за один заход. */
function WeekEditor({
  specialistId,
  weekStart,
  onClose,
}: {
  specialistId: string
  weekStart: string
  onClose: () => void
}) {
  const db = useDB()
  const days = weekDays(weekStart)
  // По умолчанию отмечены дни, которые уже рабочие на этой неделе.
  const [picked, setPicked] = useState<boolean[]>(() =>
    days.map((date) => {
      const s = db.schedules.find((x) => x.specialistId === specialistId && x.date === date)
      return !!s && s.windows.length > 0
    }),
  )
  const [from, setFrom] = useState('10:00')
  const [to, setTo] = useState('18:00')
  const [withBreak, setWithBreak] = useState(false)
  const [breakFrom, setBreakFrom] = useState('13:00')
  const [breakTo, setBreakTo] = useState('14:00')

  const toggle = (i: number) => setPicked((p) => p.map((v, x) => (x === i ? !v : v)))

  const apply = () => {
    if (toMinutes(to) - toMinutes(from) < 15) {
      alert('Конец рабочего дня должен быть позже начала (минимум 15 минут).')
      return
    }
    if (withBreak && toMinutes(breakTo) - toMinutes(breakFrom) < 15) {
      alert('Конец перерыва должен быть позже начала (минимум 15 минут).')
      return
    }
    if (withBreak && (toMinutes(breakFrom) < toMinutes(from) || toMinutes(breakTo) > toMinutes(to))) {
      alert('Перерыв должен быть внутри рабочего времени.')
      return
    }
    const offDays = days.filter((_, i) => !picked[i])
    const busyOff = offDays.filter((date) =>
      db.bookings.some((b) => b.specialistId === specialistId && b.date === date && b.status !== 'cancelled'),
    )
    if (busyOff.length > 0) {
      const list = busyOff.map((d) => formatDayMonth(d)).join(', ')
      if (!confirm(`В выходные дни (${list}) уже есть записи клиентов. Записи останутся, но день станет выходным. Продолжить?`)) return
    }
    setDaySchedules(
      days.map((date, i) => ({
        specialistId,
        date,
        windows: picked[i] ? [{ start: from, end: to }] : [],
        breaks: picked[i] && withBreak ? [{ start: breakFrom, end: breakTo }] : [],
      })),
    )
    onClose()
  }

  const spec = db.specialists.find((s) => s.id === specialistId)
  return (
    <Modal title={`Неделя · ${spec ? specialistName(spec, A) : ''}`} onClose={onClose}>
      <div className="form">
        <p className="muted small">
          Отмеченные дни станут рабочими с указанным временем, остальные — выходными.
          Неделя {formatDayMonth(days[0])} — {formatDayMonth(days[6])}.
        </p>
        <div className="field">
          <span className="field-label">Рабочие дни</span>
          <div className="weekday-picker">
            {days.map((date, i) => (
              <button
                key={date}
                type="button"
                className={`weekday-pill${picked[i] ? ' active' : ''}`}
                onClick={() => toggle(i)}
              >
                <span>{WEEKDAY_LABELS[i]}</span>
                <span className="muted small">{formatDayMonth(date)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="time-row">
          <Field label="С">
            <input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="До">
            <input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <label className="check-item">
          <input type="checkbox" checked={withBreak} onChange={() => setWithBreak((v) => !v)} />
          <span>Перерыв каждый рабочий день</span>
        </label>
        {withBreak && (
          <div className="time-row">
            <Field label="Перерыв с">
              <input type="time" step={900} value={breakFrom} onChange={(e) => setBreakFrom(e.target.value)} />
            </Field>
            <Field label="Перерыв до">
              <input type="time" step={900} value={breakTo} onChange={(e) => setBreakTo(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={apply}>
            Применить к неделе
          </button>
        </div>
      </div>
    </Modal>
  )
}
