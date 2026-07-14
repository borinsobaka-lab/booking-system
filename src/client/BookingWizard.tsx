import { useMemo, useState } from 'react'
import { useDB, ratingOf } from '../db'
import { Avatar, Stars } from '../ui'
import { RichTextView } from '../RichText'
import { useI18n, fmtDuration, fmtPrice, fmtFull, fmtMonthYear, weekdayHeaders, fmtReviewCount, fmtDayShort } from '../i18n'
import { pick, specialistName } from '../localized'
import { addMinutes, fromDateKey, toDateKey, todayKey } from '../time'
import {
  dayAvailable,
  nearestSlots,
  servicesBookableAt,
  servicesOf,
  specialistFreeAt,
  specialistsDoing,
  startsFor,
  type Selection,
} from './booking'
import type { BookingForm, Service, Specialist } from '../types'

export type Flow = 'master' | 'date' | 'service'
export type Step = 'specialist' | 'service' | 'datetime' | 'confirm'

const FLOWS: Record<Flow, Step[]> = {
  master: ['specialist', 'service', 'datetime', 'confirm'],
  date: ['datetime', 'service', 'specialist', 'confirm'],
  service: ['service', 'specialist', 'datetime', 'confirm'],
}

const STEP_KEY: Record<Step, string> = {
  specialist: 'step.specialist',
  service: 'step.service',
  datetime: 'step.datetime',
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

  const back = () => {
    if (index === 0) return onExit()
    clearFrom(steps[index - 1])
    setIndex((i) => i - 1)
  }
  const clearFrom = (fromStep: Step) => {
    const order = steps.slice(steps.indexOf(fromStep))
    setSel((s) => {
      const n = { ...s }
      if (order.includes('specialist')) delete n.specialistId
      if (order.includes('service')) delete n.serviceId
      if (order.includes('datetime')) {
        delete n.date
        delete n.start
      }
      return n
    })
  }

  // Следующий шаг; если дата и время уже выбраны (например, слот на карточке
  // мастера) — шаг «дата и время» пропускается.
  const advanceFrom = (i: number, s: Selection) => {
    let ni = i + 1
    while (ni < steps.length && steps[ni] === 'datetime' && !!s.date && !!s.start) ni++
    return Math.min(steps.length - 1, ni)
  }

  const choose = (p: Partial<Selection>) => {
    const nsel = { ...sel, ...p }
    setSel(nsel)
    setIndex((i) => advanceFrom(i, nsel))
  }

  const progress = ((index + 1) / steps.length) * 100

  return (
    <div className="wizard">
      {/* Компактная шапка + прогресс + «Назад» — закреплены при скролле */}
      <div className="wiz-sticky">
        <CompactBrand onHome={onExit} />
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
      </div>

      <div className="wiz-content">
        {/* У шага «дата и время» заголовок динамический — задаётся внутри шага. */}
        {step !== 'datetime' && <h2 className="wiz-title">{t(STEP_KEY[step])}</h2>}

        <div className="wiz-body">
          {step === 'specialist' && (
            <SpecialistStep
              sel={sel}
              onPick={(id) => choose({ specialistId: id })}
              onPickSlot={(id, date, start) => choose({ specialistId: id, date, start })}
            />
          )}
          {step === 'service' && <ServiceStep sel={sel} onPick={(id) => choose({ serviceId: id })} />}
          {step === 'datetime' && <DateTimeStep sel={sel} onPick={(date, start) => choose({ date, start })} />}
          {step === 'confirm' && <ConfirmStep sel={sel} onBook={onBooked} />}
        </div>
      </div>
    </div>
  )
}

/** Компактная шапка бренда для процесса записи: логотип слева, название и адрес
 *  справа. Клик — на главную. */
function CompactBrand({ onHome }: { onHome: () => void }) {
  const db = useDB()
  const { lang } = useI18n()
  const name = pick(db.brand.name, lang)
  const address = pick(db.brand.address, lang)
  return (
    <button className="wiz-brand" onClick={onHome} title={name}>
      <Avatar src={db.brand.avatar} name={name} size={40} />
      <div className="wiz-brand-info">
        <div className="wiz-brand-name">{name}</div>
        {address && <div className="wiz-brand-address">📍 {address}</div>}
      </div>
    </button>
  )
}

// --- Шаг: специалист (список во всю ширину + карточка с биографией) ---
function SpecialistStep({
  sel,
  onPick,
  onPickSlot,
}: {
  sel: Selection
  onPick: (id: string) => void
  onPickSlot: (id: string, date: string, start: string) => void
}) {
  const db = useDB()
  const { lang, t } = useI18n()
  const [bioId, setBioId] = useState<string | null>(null)
  const today = todayKey()
  const list: Specialist[] = sel.serviceId ? specialistsDoing(sel.serviceId) : db.specialists
  const knowsTime = !!(sel.date && sel.start && sel.serviceId)
  const isFree = (sp: Specialist) => (knowsTime ? specialistFreeAt(sp.id, sel.serviceId!, sel.date!, sel.start!) : true)

  if (list.length === 0) return <Empty text={t('empty.noSpecialists')} />

  // Полная карточка специалиста (биография + отзывы)
  const bio = bioId ? list.find((s) => s.id === bioId) : null
  if (bio) {
    const rating = ratingOf(db.reviews, bio.id)
    return (
      <div className="spec-bio">
        <Avatar src={bio.avatar} name={specialistName(bio, lang)} size={96} />
        <div className="spec-bio-name">{specialistName(bio, lang)}</div>
        <div className="spec-bio-role">{pick(bio.role, lang)}</div>
        <RatingLine avg={rating.avg} count={rating.count} center />
        {pick(bio.bio, lang) && <RichTextView className="spec-bio-text" html={pick(bio.bio, lang)} />}
        <ReviewsList specialistId={bio.id} />
        <div className="wiz-footer">
          <button className="btn btn-primary btn-block btn-lg" disabled={!isFree(bio)} onClick={() => onPick(bio.id)}>
            {t('specialist.select')}
          </button>
          <button className="btn btn-block" onClick={() => setBioId(null)}>
            {t('specialist.closeBio')}
          </button>
        </div>
      </div>
    )
  }

  // Показываем ближайшие слоты, только если время ещё не выбрано.
  const showNearest = !sel.start

  return (
    <div className="spec-list">
      {list.map((sp) => {
        const free = isFree(sp)
        const rating = ratingOf(db.reviews, sp.id)
        const nearest = showNearest && free ? nearestSlots(sp.id, sel.serviceId, 5) : null
        return (
          <div key={sp.id} className={`spec-row${free ? '' : ' unavailable'}`}>
            <div className="spec-row-top">
              <button className="spec-row-main" disabled={!free} onClick={() => free && onPick(sp.id)}>
                <Avatar src={sp.avatar} name={specialistName(sp, lang)} size={56} dim={!free} />
                <div className="spec-row-info">
                  <div className="spec-row-name">{specialistName(sp, lang)}</div>
                  <div className="spec-row-role">{pick(sp.role, lang)}</div>
                  <RatingLine avg={rating.avg} count={rating.count} />
                  {!free && <div className="spec-row-badge">{t('specialist.busy')}</div>}
                </div>
              </button>
              <button className="spec-info-btn" onClick={() => setBioId(sp.id)} aria-label="info" title="info">
                i
              </button>
            </div>
            {nearest && (
              <div className="spec-slots">
                <div className="spec-slots-label">
                  {t('nearest')} · {nearest.date === today ? t('today') : fmtDayShort(nearest.date, lang)}
                </div>
                <div className="spec-slots-chips">
                  {nearest.starts.map((s) => (
                    <button key={s} className="spec-slot" onClick={() => onPickSlot(sp.id, nearest.date, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Звёзды + число отзывов (или «нет отзывов»). */
function RatingLine({ avg, count, center }: { avg: number; count: number; center?: boolean }) {
  const { lang, t } = useI18n()
  return (
    <div className={`rating-line${center ? ' center' : ''}`}>
      <Stars value={avg} size={14} />
      <span className="rating-count">{count > 0 ? fmtReviewCount(count, lang) : t('reviews.new')}</span>
    </div>
  )
}

/** Список отзывов о специалисте. */
function ReviewsList({ specialistId }: { specialistId: string }) {
  const db = useDB()
  const { lang, t } = useI18n()
  const reviews = db.reviews
    .filter((r) => r.specialistId === specialistId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  if (reviews.length === 0) return null
  return (
    <div className="reviews">
      <h4 className="reviews-title">{t('reviews.title')}</h4>
      {reviews.map((r) => (
        <div className="review-item" key={r.id}>
          <Avatar src={r.avatar} name={r.authorName} size={40} />
          <div className="review-item-body">
            <div className="review-item-head">
              <b>{r.authorName}</b>
              <span className="review-item-date">{fmtFull(r.date, lang)}</span>
            </div>
            <Stars value={r.rating} size={13} />
            {r.text && <div className="review-item-text">{r.text}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Шаг: услуга (во всю ширину, широкая картинка, описание в 2 строки) ---
function ServiceStep({ sel, onPick }: { sel: Selection; onPick: (id: string) => void }) {
  const db = useDB()
  const { lang, t } = useI18n()
  const [expanded, setExpanded] = useState<string | null>(null)
  let list: Service[]
  if (sel.specialistId) list = servicesOf(sel.specialistId)
  else if (sel.date && sel.start) list = servicesBookableAt(sel.date, sel.start)
  else list = db.services

  if (list.length === 0) return <Empty text={t('empty.noServices')} />

  return (
    <div className="svc-cards">
      {list.map((s) => {
        const desc = pick(s.description, lang)
        const isOpen = expanded === s.id
        return (
          <div key={s.id} className="svc-full" onClick={() => onPick(s.id)}>
            <div className="svc-full-img" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span>💆</span>}
            </div>
            <div className="svc-full-body">
              <div className="svc-full-head">
                <div className="svc-full-title">{pick(s.name, lang)}</div>
                <div className="svc-full-price">{fmtPrice(s.price, lang)}</div>
              </div>
              <div className="svc-full-dur">⏱ {fmtDuration(s.durationMin, lang)}</div>
              {desc && (
                <>
                  <div className={`svc-full-desc${isOpen ? ' open' : ''}`}>{desc}</div>
                  <button
                    className="linkbtn svc-full-more"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpanded(isOpen ? null : s.id)
                    }}
                  >
                    {isOpen ? t('less') : t('more')}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Шаг: дата и время (календарь сверху, слоты ниже, кнопка «Продолжить») ---
function DateTimeStep({ sel, onPick }: { sel: Selection; onPick: (date: string, start: string) => void }) {
  const { lang, t } = useI18n()
  const [month, setMonth] = useState(() => {
    const d = fromDateKey(todayKey())
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [date, setDate] = useState<string | null>(sel.date ?? null)
  const [start, setStart] = useState<string | null>(sel.start ?? null)

  const grid = useMemo(() => buildMonth(month.y, month.m), [month])
  const today = todayKey()
  const weekdays = useMemo(() => weekdayHeaders(lang), [lang])
  const times = useMemo(() => (date ? startsFor(date, sel) : []), [date, sel])

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }
  const chooseDate = (d: string) => {
    setDate(d)
    setStart(null)
  }

  return (
    <div className="datetime">
      <h2 className="wiz-title">{date ? t('step.time') : t('step.date')}</h2>
      <div className="calendar">
        <div className="cal-head">
          <button className="iconbtn" onClick={() => shift(-1)}>
            ‹
          </button>
          <div className="cal-month">{fmtMonthYear(month.y, month.m, lang)}</div>
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
                className={`cal-cell${avail ? ' available' : ''}${cell === today ? ' today' : ''}${date === cell ? ' selected' : ''}`}
                disabled={!avail}
                onClick={() => chooseDate(cell)}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      {date && (
        <div className="datetime-slots">
          <div className="time-day muted">{fmtFull(date, lang)}</div>
          {times.length === 0 ? (
            <div className="wiz-empty muted">{t('empty.noTime')}</div>
          ) : (
            <div className="slot-grid big">
              {times.map((time) => (
                <button key={time} className={`slot${start === time ? ' active' : ''}`} onClick={() => setStart(time)}>
                  {time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {date && start && (
        <div className="wiz-footer">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => onPick(date, start)}>
            {t('continue')}
          </button>
        </div>
      )}
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

      <div className="wiz-footer">
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
