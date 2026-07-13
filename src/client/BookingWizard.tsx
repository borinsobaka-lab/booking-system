import { useMemo, useState } from 'react'
import { useDB } from '../db'
import { Avatar, money, duration } from '../ui'
import { addMinutes, fromDateKey, toDateKey, todayKey, formatFull } from '../time'
import {
  dayAvailable,
  servicesBookableAt,
  servicesOf,
  specialistFreeAt,
  specialistsDoing,
  startsFor,
  type Selection,
} from './booking'
import type { Service, Specialist } from '../types'

export type Flow = 'master' | 'date' | 'service'
export type Step = 'specialist' | 'service' | 'date' | 'time' | 'confirm'

const FLOWS: Record<Flow, Step[]> = {
  master: ['specialist', 'service', 'date', 'time', 'confirm'],
  date: ['date', 'time', 'service', 'specialist', 'confirm'],
  service: ['service', 'specialist', 'date', 'time', 'confirm'],
}

const STEP_TITLE: Record<Step, string> = {
  specialist: 'Выберите мастера',
  service: 'Выберите услугу',
  date: 'Выберите дату',
  time: 'Выберите время',
  confirm: 'Подтверждение',
}

export function BookingWizard({
  flow,
  onExit,
  onBooked,
}: {
  flow: Flow
  onExit: () => void
  onBooked: (sel: Required<Pick<Selection, 'serviceId' | 'specialistId' | 'date' | 'start'>> & { clientName?: string }) => void
}) {
  const steps = FLOWS[flow]
  const [index, setIndex] = useState(0)
  const [sel, setSel] = useState<Selection>({})
  const step = steps[index]

  const patch = (p: Partial<Selection>) => setSel((s) => ({ ...s, ...p }))
  const next = () => setIndex((i) => Math.min(steps.length - 1, i + 1))
  const back = () => {
    if (index === 0) return onExit()
    // при шаге назад сбрасываем выбор текущего шага, чтобы не «залипало»
    const prev = steps[index - 1]
    clearFrom(prev)
    setIndex((i) => i - 1)
  }
  const clearFrom = (fromStep: Step) => {
    // очищаем значения, выбранные на fromStep и позже
    const order = steps.slice(steps.indexOf(fromStep))
    setSel((s) => {
      const n = { ...s }
      if (order.includes('specialist')) delete n.specialistId
      if (order.includes('service')) delete n.serviceId
      if (order.includes('date')) delete n.date
      if (order.includes('time')) delete n.start
      return n
    })
  }

  const choose = (p: Partial<Selection>) => {
    patch(p)
    next()
  }

  const progress = ((index + 1) / steps.length) * 100

  return (
    <div className="wizard">
      <div className="wizard-top">
        <button className="wiz-back" onClick={back}>
          ‹ Назад
        </button>
        <div className="wiz-progress">
          <div className="wiz-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <span className="wiz-step-count">
          {index + 1}/{steps.length}
        </span>
      </div>

      <h2 className="wiz-title">{STEP_TITLE[step]}</h2>
      <SelectionSummary sel={sel} />

      <div className="wiz-body">
        {step === 'specialist' && <SpecialistStep sel={sel} onPick={(id) => choose({ specialistId: id })} />}
        {step === 'service' && <ServiceStep sel={sel} onPick={(id) => choose({ serviceId: id })} />}
        {step === 'date' && <DateStep sel={sel} onPick={(d) => choose({ date: d })} />}
        {step === 'time' && <TimeStep sel={sel} onPick={(t) => choose({ start: t })} />}
        {step === 'confirm' && <ConfirmStep sel={sel} onBook={onBooked} />}
      </div>
    </div>
  )
}

function SelectionSummary({ sel }: { sel: Selection }) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === sel.serviceId)
  const sp = db.specialists.find((s) => s.id === sel.specialistId)
  const parts: string[] = []
  if (sp) parts.push(`${sp.firstName} ${sp.lastName}`)
  if (svc) parts.push(svc.name)
  if (sel.date) parts.push(formatFull(sel.date))
  if (sel.start) parts.push(sel.start)
  if (parts.length === 0) return null
  return <div className="wiz-summary">{parts.join(' · ')}</div>
}

// --- Шаг: специалист ---
function SpecialistStep({ sel, onPick }: { sel: Selection; onPick: (id: string) => void }) {
  const db = useDB()
  // Кого показываем: если известна услуга — только тех, кто её делает.
  const list: Specialist[] = sel.serviceId ? specialistsDoing(sel.serviceId) : db.specialists
  // Если известны дата и время — недоступных блёрим, но показываем.
  const knowsTime = !!(sel.date && sel.start && sel.serviceId)

  if (list.length === 0) return <Empty text="Пока нет мастеров для этой услуги." />

  return (
    <div className="pick-grid">
      {list.map((sp) => {
        const free = knowsTime ? specialistFreeAt(sp.id, sel.serviceId!, sel.date!, sel.start!) : true
        return (
          <button
            key={sp.id}
            className={`pick-card spec${free ? '' : ' unavailable'}`}
            disabled={!free}
            onClick={() => free && onPick(sp.id)}
          >
            <Avatar src={sp.avatar} name={`${sp.firstName} ${sp.lastName}`} size={72} dim={!free} />
            <div className="pick-title">
              {sp.firstName} {sp.lastName}
            </div>
            <div className="pick-sub">{sp.role}</div>
            {!free && <div className="pick-badge">занят в это время</div>}
          </button>
        )
      })}
    </div>
  )
}

// --- Шаг: услуга ---
function ServiceStep({ sel, onPick }: { sel: Selection; onPick: (id: string) => void }) {
  const db = useDB()
  let list: Service[]
  if (sel.specialistId) list = servicesOf(sel.specialistId)
  else if (sel.date && sel.start) list = servicesBookableAt(sel.date, sel.start)
  else list = db.services

  if (list.length === 0) return <Empty text="Нет доступных услуг для этого выбора." />

  return (
    <div className="svc-list">
      {list.map((s) => (
        <button key={s.id} className="svc-row" onClick={() => onPick(s.id)}>
          <div className="svc-row-img" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
            {!s.image && <span>💆</span>}
          </div>
          <div className="svc-row-main">
            <div className="svc-row-title">{s.name}</div>
            {s.description && <div className="svc-row-desc">{s.description}</div>}
            <div className="svc-row-meta">
              <span>⏱ {duration(s.durationMin)}</span>
            </div>
          </div>
          <div className="svc-row-price">{money(s.price)}</div>
        </button>
      ))}
    </div>
  )
}

// --- Шаг: дата ---
function DateStep({ sel, onPick }: { sel: Selection; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => {
    const d = fromDateKey(todayKey())
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const grid = useMemo(() => buildMonth(month.y, month.m), [month])
  const today = todayKey()
  const monthLabel = new Date(month.y, month.m, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="iconbtn" onClick={() => shift(-1)}>
          ‹
        </button>
        <div className="cal-month">{monthLabel}</div>
        <button className="iconbtn" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="cal-weekdays">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="cal-grid">
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} className="cal-cell empty" />
          const past = cell < today
          const avail = !past && dayAvailable(cell, sel)
          const d = fromDateKey(cell)
          return (
            <button
              key={i}
              className={`cal-cell${avail ? ' available' : ''}${cell === today ? ' today' : ''}${sel.date === cell ? ' selected' : ''}`}
              disabled={!avail}
              onClick={() => onPick(cell)}
              title={avail ? 'Есть свободное время' : past ? 'Прошедший день' : 'Нет свободного времени'}
            >
              {d.getDate()}
              {avail && <span className="cal-dot" />}
            </button>
          )
        })}
      </div>
      <div className="cal-legend">
        <span>
          <span className="cal-dot" /> есть свободное время
        </span>
      </div>
    </div>
  )
}

// --- Шаг: время ---
function TimeStep({ sel, onPick }: { sel: Selection; onPick: (t: string) => void }) {
  const times = useMemo(() => (sel.date ? startsFor(sel.date, sel) : []), [sel])
  if (!sel.date) return <Empty text="Сначала выберите дату." />
  if (times.length === 0) return <Empty text="На этот день нет свободного времени." />
  return (
    <div>
      <div className="time-day muted">{formatFull(sel.date)}</div>
      <div className="slot-grid big">
        {times.map((t) => (
          <button key={t} className={`slot${sel.start === t ? ' active' : ''}`} onClick={() => onPick(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Шаг: подтверждение ---
function ConfirmStep({
  sel,
  onBook,
}: {
  sel: Selection
  onBook: (v: Required<Pick<Selection, 'serviceId' | 'specialistId' | 'date' | 'start'>> & { clientName?: string }) => void
}) {
  const db = useDB()
  const [clientName, setClientName] = useState('')
  const svc = db.services.find((s) => s.id === sel.serviceId)
  const sp = db.specialists.find((s) => s.id === sel.specialistId)
  const ready = sel.serviceId && sel.specialistId && sel.date && sel.start
  const end = svc && sel.start ? addMinutes(sel.start, svc.durationMin) : ''

  return (
    <div className="confirm">
      <div className="confirm-card">
        <div className="confirm-row">
          <span>Услуга</span>
          <b>{svc?.name}</b>
        </div>
        <div className="confirm-row">
          <span>Мастер</span>
          <b>
            {sp?.firstName} {sp?.lastName}
          </b>
        </div>
        <div className="confirm-row">
          <span>Когда</span>
          <b>
            {sel.date && formatFull(sel.date)}, {sel.start}–{end}
          </b>
        </div>
        <div className="confirm-row">
          <span>Стоимость</span>
          <b>{svc && money(svc.price)}</b>
        </div>
      </div>
      <label className="field">
        <span className="field-label">Ваше имя</span>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Как к вам обращаться" />
      </label>
      <p className="muted small">
        Запись подтверждается автоматически. Позже здесь появятся уведомления на почту и подтверждение
        по телефону.
      </p>
      <button
        className="btn btn-primary btn-block btn-lg"
        disabled={!ready}
        onClick={() =>
          ready &&
          onBook({
            serviceId: sel.serviceId!,
            specialistId: sel.specialistId!,
            date: sel.date!,
            start: sel.start!,
            clientName: clientName.trim() || undefined,
          })
        }
      >
        Записаться
      </button>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="wiz-empty muted">{text}</div>
}

/** Ячейки месяца: массив длины кратной 7, начинается с понедельника, null — пустые. */
function buildMonth(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7 // 0 = понедельник
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateKey(new Date(year, month, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
