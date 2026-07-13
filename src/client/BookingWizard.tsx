import { useMemo, useState } from 'react'
import { useDB } from '../db'
import { Avatar } from '../ui'
import { useI18n, fmtDuration, fmtPrice, fmtFull, fmtMonthYear, weekdayHeaders } from '../i18n'
import { pick, specialistName } from '../localized'
import { addMinutes, fromDateKey, toDateKey, todayKey } from '../time'
import {
  dayAvailable,
  servicesBookableAt,
  servicesOf,
  specialistFreeAt,
  specialistsDoing,
  startsFor,
  type Selection,
} from './booking'
import type { BookingForm, Service, Specialist } from '../types'

export type Flow = 'master' | 'date' | 'service'
export type Step = 'specialist' | 'service' | 'date' | 'time' | 'confirm'

const FLOWS: Record<Flow, Step[]> = {
  master: ['specialist', 'service', 'date', 'time', 'confirm'],
  date: ['date', 'time', 'service', 'specialist', 'confirm'],
  service: ['service', 'specialist', 'date', 'time', 'confirm'],
}

const STEP_KEY: Record<Step, string> = {
  specialist: 'step.specialist',
  service: 'step.service',
  date: 'step.date',
  time: 'step.time',
  confirm: 'step.confirm',
}

export function BookingWizard({
  flow,
  onExit,
  onBooked,
}: {
  flow: Flow
  onExit: () => void
  onBooked: (sel: Required<Pick<Selection, 'serviceId' | 'specialistId' | 'date' | 'start'>> & BookingForm) => void
}) {
  const { t } = useI18n()
  const steps = FLOWS[flow]
  const [index, setIndex] = useState(0)
  const [sel, setSel] = useState<Selection>({})
  const step = steps[index]

  const patch = (p: Partial<Selection>) => setSel((s) => ({ ...s, ...p }))
  const next = () => setIndex((i) => Math.min(steps.length - 1, i + 1))
  const back = () => {
    if (index === 0) return onExit()
    const prev = steps[index - 1]
    clearFrom(prev)
    setIndex((i) => i - 1)
  }
  const clearFrom = (fromStep: Step) => {
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
          ‹ {t('back')}
        </button>
        <div className="wiz-progress">
          <div className="wiz-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <span className="wiz-step-count">
          {index + 1}/{steps.length}
        </span>
      </div>

      <h2 className="wiz-title">{t(STEP_KEY[step])}</h2>
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
  const { lang } = useI18n()
  const svc = db.services.find((s) => s.id === sel.serviceId)
  const sp = db.specialists.find((s) => s.id === sel.specialistId)
  const parts: string[] = []
  if (sp) parts.push(specialistName(sp, lang))
  if (svc) parts.push(pick(svc.name, lang))
  if (sel.date) parts.push(fmtFull(sel.date, lang))
  if (sel.start) parts.push(sel.start)
  if (parts.length === 0) return null
  return <div className="wiz-summary">{parts.join(' · ')}</div>
}

// --- Шаг: специалист ---
function SpecialistStep({ sel, onPick }: { sel: Selection; onPick: (id: string) => void }) {
  const db = useDB()
  const { lang, t } = useI18n()
  const list: Specialist[] = sel.serviceId ? specialistsDoing(sel.serviceId) : db.specialists
  const knowsTime = !!(sel.date && sel.start && sel.serviceId)

  if (list.length === 0) return <Empty text={t('empty.noSpecialists')} />

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
            <Avatar src={sp.avatar} name={specialistName(sp, lang)} size={72} dim={!free} />
            <div className="pick-title">{specialistName(sp, lang)}</div>
            <div className="pick-sub">{pick(sp.role, lang)}</div>
            {!free && <div className="pick-badge">{t('specialist.busy')}</div>}
          </button>
        )
      })}
    </div>
  )
}

// --- Шаг: услуга ---
function ServiceStep({ sel, onPick }: { sel: Selection; onPick: (id: string) => void }) {
  const db = useDB()
  const { lang, t } = useI18n()
  let list: Service[]
  if (sel.specialistId) list = servicesOf(sel.specialistId)
  else if (sel.date && sel.start) list = servicesBookableAt(sel.date, sel.start)
  else list = db.services

  if (list.length === 0) return <Empty text={t('empty.noServices')} />

  return (
    <div className="svc-list">
      {list.map((s) => (
        <button key={s.id} className="svc-row" onClick={() => onPick(s.id)}>
          <div className="svc-row-img" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
            {!s.image && <span>💆</span>}
          </div>
          <div className="svc-row-main">
            <div className="svc-row-title">{pick(s.name, lang)}</div>
            {pick(s.description, lang) && <div className="svc-row-desc">{pick(s.description, lang)}</div>}
            <div className="svc-row-meta">
              <span>⏱ {fmtDuration(s.durationMin, lang)}</span>
            </div>
          </div>
          <div className="svc-row-price">{fmtPrice(s.price, lang)}</div>
        </button>
      ))}
    </div>
  )
}

// --- Шаг: дата ---
function DateStep({ sel, onPick }: { sel: Selection; onPick: (d: string) => void }) {
  const { lang, t } = useI18n()
  const [month, setMonth] = useState(() => {
    const d = fromDateKey(todayKey())
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const grid = useMemo(() => buildMonth(month.y, month.m), [month])
  const today = todayKey()
  const monthLabel = fmtMonthYear(month.y, month.m, lang)
  const weekdays = useMemo(() => weekdayHeaders(lang), [lang])

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
        {weekdays.map((w, i) => (
          <div key={i}>{w}</div>
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
            >
              {d.getDate()}
              {avail && <span className="cal-dot" />}
            </button>
          )
        })}
      </div>
      <div className="cal-legend">
        <span>
          <span className="cal-dot" /> {t('cal.available')}
        </span>
      </div>
    </div>
  )
}

// --- Шаг: время ---
function TimeStep({ sel, onPick }: { sel: Selection; onPick: (t: string) => void }) {
  const { lang, t } = useI18n()
  const times = useMemo(() => (sel.date ? startsFor(sel.date, sel) : []), [sel])
  if (!sel.date) return <Empty text={t('empty.pickDate')} />
  if (times.length === 0) return <Empty text={t('empty.noTime')} />
  return (
    <div>
      <div className="time-day muted">{fmtFull(sel.date, lang)}</div>
      <div className="slot-grid big">
        {times.map((time) => (
          <button key={time} className={`slot${sel.start === time ? ' active' : ''}`} onClick={() => onPick(time)}>
            {time}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Шаг: подтверждение и форма брони ---
function ConfirmStep({
  sel,
  onBook,
}: {
  sel: Selection
  onBook: (v: Required<Pick<Selection, 'serviceId' | 'specialistId' | 'date' | 'start'>> & BookingForm) => void
}) {
  const db = useDB()
  const { lang, t } = useI18n()
  const [form, setForm] = useState<BookingForm>({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    comment: '',
    consent: false,
  })
  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const svc = db.services.find((s) => s.id === sel.serviceId)
  const sp = db.specialists.find((s) => s.id === sel.specialistId)
  const end = svc && sel.start ? addMinutes(sel.start, svc.durationMin) : ''

  const emailValid = form.clientEmail.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim())
  const canBook =
    !!(sel.serviceId && sel.specialistId && sel.date && sel.start) &&
    form.clientName.trim().length > 0 &&
    form.clientPhone.trim().length >= 5 &&
    emailValid &&
    form.consent

  return (
    <div className="confirm">
      <div className="booking-summary">
        <div className="booking-master">
          <Avatar src={sp?.avatar ?? null} name={sp ? specialistName(sp, lang) : ''} size={72} />
          <div className="booking-master-name">{sp ? specialistName(sp, lang) : ''}</div>
          <div className="booking-master-role">{sp ? pick(sp.role, lang) : ''}</div>
        </div>
        <div className="confirm-card">
          <div className="confirm-row">
            <span>{t('label.dateTime')}</span>
            <b>
              {sel.date && fmtFull(sel.date, lang)}, {sel.start}–{end}
            </b>
          </div>
          <div className="confirm-row">
            <span>{t('label.service')}</span>
            <b>{svc && pick(svc.name, lang)}</b>
          </div>
          <div className="confirm-row">
            <span>{t('label.serviceCost')}</span>
            <b>{svc && fmtPrice(svc.price, lang)}</b>
          </div>
          <div className="confirm-row total">
            <span>{t('label.total')}</span>
            <b>{svc && fmtPrice(svc.price, lang)}</b>
          </div>
        </div>
      </div>

      <h3 className="form-section-title">{t('form.yourData')}</h3>
      <label className="field">
        <span className="field-label">{t('label.name')} *</span>
        <input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder={t('form.namePh')} />
      </label>
      <label className="field">
        <span className="field-label">{t('label.phone')} *</span>
        <input type="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} placeholder="+995 555 12 34 56" />
      </label>
      <label className="field">
        <span className="field-label">{t('label.email')}</span>
        <input type="email" value={form.clientEmail} onChange={(e) => set('clientEmail', e.target.value)} placeholder="you@example.com" />
        {!emailValid && <span className="field-error">{t('form.emailErr')}</span>}
      </label>
      <label className="field">
        <span className="field-label">{t('label.comment')}</span>
        <textarea value={form.comment} onChange={(e) => set('comment', e.target.value)} rows={3} placeholder={t('form.commentPh')} />
      </label>

      <label className="consent">
        <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
        <span>{t('form.consent')}</span>
      </label>

      <button
        className="btn btn-primary btn-block btn-lg"
        disabled={!canBook}
        onClick={() =>
          canBook &&
          onBook({
            serviceId: sel.serviceId!,
            specialistId: sel.specialistId!,
            date: sel.date!,
            start: sel.start!,
            clientName: form.clientName.trim(),
            clientPhone: form.clientPhone.trim(),
            clientEmail: form.clientEmail.trim(),
            comment: form.comment.trim(),
            consent: form.consent,
          })
        }
      >
        {t('form.book')}
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
