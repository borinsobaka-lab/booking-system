import { useMemo, useState } from 'react'
import { useDB, cancelBookingLocal, addBooking, uid } from '../db'
import { isRemote } from '../config'
import * as remote from '../remote'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import { Field, Modal, money, duration } from '../ui'
import { todayKey, formatFull, weekdayLong, formatDayMonth, addMinutes } from '../time'
import { freeSlots } from '../availability'
import { pick, specialistName } from '../localized'
import { Icon } from '../icons'
import type { Booking, Lang } from '../types'

const A: Lang = 'ru' // отображение контента в админке

type Tab = 'feed' | 'history' | 'cancelled'

/** Ключ клиента для подсчёта визитов: телефон → email → имя. */
function clientKey(b: Booking): string {
  const phone = (b.clientPhone || '').replace(/[^\d]/g, '')
  if (phone) return 'p:' + phone
  if (b.clientEmail) return 'e:' + b.clientEmail.trim().toLowerCase()
  return 'n:' + (b.clientName || '').trim().toLowerCase()
}

interface Visit {
  overall: number
  master: number
}

/** Номер визита клиента (в целом и к конкретному мастеру) среди подтверждённых. */
function computeVisits(bookings: Booking[]): Map<string, Visit> {
  const confirmed = bookings
    .filter((b) => b.status !== 'cancelled')
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.start < b.start ? -1 : 1))
  const overall = new Map<string, number>()
  const master = new Map<string, number>()
  const res = new Map<string, Visit>()
  for (const b of confirmed) {
    const k = clientKey(b)
    const o = (overall.get(k) || 0) + 1
    overall.set(k, o)
    const mk = k + '|' + b.specialistId
    const m = (master.get(mk) || 0) + 1
    master.set(mk, m)
    res.set(b.id, { overall: o, master: m })
  }
  return res
}

const byStart = (a: Booking, b: Booking) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)

export function BookingsPage() {
  const db = useDB()
  const { canManage } = useAuth()
  const [deny, denyModal] = useDeny()
  const [tab, setTab] = useState<Tab>('feed')
  const [detail, setDetail] = useState<Booking | null>(null)
  const [adding, setAdding] = useState(false)

  const visits = useMemo(() => computeVisits(db.bookings), [db.bookings])
  const today = todayKey()

  // Лента: сегодня всегда + будущие дни с записями, по возрастанию даты.
  const active = db.bookings.filter((b) => b.status !== 'cancelled' && b.date >= today)
  const feedDates = [...new Set([today, ...active.map((b) => b.date)])].sort()

  const cancel = async (b: Booking) => {
    if (!canManage) return deny()
    if (!confirm('Отменить эту запись?')) return
    if (isRemote()) {
      try {
        await remote.cancelBookingRemote(b.id)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось отменить запись')
        return
      }
    }
    cancelBookingLocal(b.id)
    setDetail(null)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Записи</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (canManage ? setAdding(true) : deny())}
          disabled={db.specialists.length === 0}
        >
          + Запись
        </button>
      </header>

      <div className="segmented book-tabs">
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
          Записи
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          История
        </button>
        <button className={tab === 'cancelled' ? 'active' : ''} onClick={() => setTab('cancelled')}>
          Отмены
        </button>
      </div>

      {db.specialists.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="calendarDays" size={44} />
          </div>
          <p>Добавьте специалистов и задайте им расписание — тогда здесь появятся записи.</p>
        </div>
      ) : tab === 'feed' ? (
        <div className="feed">
          {feedDates.map((date) => {
            const items = active.filter((b) => b.date === date).sort(byStart)
            const isToday = date === today
            return (
              <section className="feed-day" key={date}>
                <div className="feed-day-head">
                  <div className="feed-day-title">{isToday ? 'Сегодня' : formatDayMonth(date)}</div>
                  <div className="feed-day-sub">
                    {weekdayLong(date)}
                    {isToday ? `, ${formatDayMonth(date)}` : ''}
                  </div>
                </div>
                {items.length === 0 ? (
                  <div className="feed-empty muted">Нет записей</div>
                ) : (
                  <div className="feed-list">
                    {items.map((b) => (
                      <FeedCard key={b.id} booking={b} visit={visits.get(b.id)} onOpen={() => setDetail(b)} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : tab === 'history' ? (
        <BookingTable
          bookings={[...db.bookings].sort((a, b) =>
            a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.start > b.start ? -1 : 1,
          )}
          onOpen={setDetail}
          emptyText="Записей пока нет."
        />
      ) : (
        <BookingTable
          bookings={db.bookings
            .filter((b) => b.status === 'cancelled')
            .sort((a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0))}
          onOpen={setDetail}
          emptyText="Отменённых записей нет."
        />
      )}

      {detail && <BookingDetail booking={detail} canManage={canManage} onCancel={cancel} onClose={() => setDetail(null)} />}
      {adding && <ManualBooking date={today} onClose={() => setAdding(false)} />}
      {denyModal}
    </div>
  )
}

function visitLabel(v?: Visit): { text: string; badge?: string; badgeClass?: string } {
  if (!v) return { text: '' }
  const text = `${v.overall}-й визит`
  if (v.overall === 1) return { text, badge: 'новый клиент', badgeClass: 'badge-ok' }
  if (v.master === 1) return { text: `${text} · к мастеру впервые`, badge: 'первый к мастеру' }
  return { text: `${text} · к мастеру ${v.master}-й` }
}

function FeedCard({ booking, visit, onOpen }: { booking: Booking; visit?: Visit; onOpen: () => void }) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
  const vl = visitLabel(visit)
  return (
    <button className="feed-card" onClick={onOpen}>
      <div className="feed-card-time">
        <span>{booking.start}</span>
        <span className="muted">{booking.end}</span>
      </div>
      <div className="feed-card-main">
        <div className="feed-card-client">
          <b>{booking.clientName || 'Без имени'}</b>
          {vl.badge && <span className={`badge ${vl.badgeClass || ''}`}>{vl.badge}</span>}
        </div>
        {vl.text && <div className="feed-card-visit muted">{vl.text}</div>}
        <div className="feed-card-svc">
          {svc ? pick(svc.name, A) : 'Услуга'} · {sp ? specialistName(sp, A) : '—'}
        </div>
      </div>
    </button>
  )
}

function BookingTable({
  bookings,
  onOpen,
  emptyText,
}: {
  bookings: Booking[]
  onOpen: (b: Booking) => void
  emptyText: string
}) {
  const db = useDB()
  if (bookings.length === 0) return <div className="feed-empty muted">{emptyText}</div>
  return (
    <div className="book-history">
      {bookings.map((b) => {
        const svc = db.services.find((s) => s.id === b.serviceId)
        const sp = db.specialists.find((s) => s.id === b.specialistId)
        return (
          <button className="book-history-row" key={b.id} onClick={() => onOpen(b)}>
            <div className="bh-date">
              <b>{formatDayMonth(b.date)}</b>
              <span className="muted">
                {b.start}–{b.end}
              </span>
            </div>
            <div className="bh-main">
              <div>{b.clientName || 'Без имени'}</div>
              <div className="muted small">
                {svc ? pick(svc.name, A) : '—'} · {sp ? specialistName(sp, A) : '—'}
              </div>
            </div>
            <span className={`badge ${b.status === 'cancelled' ? '' : 'badge-ok'}`}>
              {b.status === 'cancelled' ? 'отменена' : 'активна'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function BookingDetail({
  booking,
  canManage,
  onCancel,
  onClose,
}: {
  booking: Booking
  canManage: boolean
  onCancel: (b: Booking) => void
  onClose: () => void
}) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
  const cancelled = booking.status === 'cancelled'
  return (
    <Modal title="Запись" onClose={onClose}>
      <div className="detail">
        <dl className="detail-list">
          <dt>Дата</dt>
          <dd>{formatFull(booking.date)}</dd>
          <dt>Время</dt>
          <dd>
            {booking.start}–{booking.end}
          </dd>
          <dt>Услуга</dt>
          <dd>
            {svc ? pick(svc.name, A) : '—'} {svc && <span className="muted">· {money(svc.price)} · {duration(svc.durationMin)}</span>}
          </dd>
          <dt>Специалист</dt>
          <dd>{sp ? specialistName(sp, A) : '—'}</dd>
          <dt>Клиент</dt>
          <dd>{booking.clientName || 'без имени'}</dd>
          {booking.clientPhone && (
            <>
              <dt>Телефон</dt>
              <dd>
                <a href={`tel:${booking.clientPhone}`}>{booking.clientPhone}</a>
              </dd>
            </>
          )}
          {booking.clientEmail && (
            <>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${booking.clientEmail}`}>{booking.clientEmail}</a>
              </dd>
            </>
          )}
          {booking.comment && (
            <>
              <dt>Комментарий</dt>
              <dd>{booking.comment}</dd>
            </>
          )}
          <dt>Статус</dt>
          <dd>
            <span className={`badge ${cancelled ? '' : 'badge-ok'}`}>{cancelled ? 'отменена' : 'подтверждена'}</span>
          </dd>
        </dl>
        <div className="form-actions">
          {!cancelled && canManage && (
            <button className="btn btn-danger" onClick={() => onCancel(booking)}>
              Отменить запись
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ManualBooking({ date, onClose }: { date: string; onClose: () => void }) {
  const db = useDB()
  const [specId, setSpecId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [start, setStart] = useState('')
  const [clientName, setClientName] = useState('')
  const [busy, setBusy] = useState(false)

  const spec = db.specialists.find((s) => s.id === specId)
  const availableServices = spec ? db.services.filter((s) => spec.serviceIds.includes(s.id)) : []
  const service = db.services.find((s) => s.id === serviceId)
  const slots = useMemo(
    () => (spec && service ? freeSlots(spec.id, date, service.durationMin) : []),
    [spec, service, date],
  )

  const save = async () => {
    if (!spec || !service || !start) return
    setBusy(true)
    if (isRemote()) {
      try {
        const bk = await remote.createBookingAdmin({
          specialistId: spec.id,
          serviceId: service.id,
          date,
          start,
          clientName: clientName.trim() || undefined,
        })
        addBooking(bk)
      } catch (e) {
        setBusy(false)
        alert(e instanceof Error ? e.message : 'Не удалось создать запись')
        return
      }
    } else {
      addBooking({
        id: uid(),
        specialistId: spec.id,
        serviceId: service.id,
        date,
        start,
        end: addMinutes(start, service.durationMin),
        status: 'confirmed',
        clientName: clientName.trim() || undefined,
        createdAt: Date.now(),
      })
    }
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Новая запись" onClose={onClose}>
      <div className="form">
        <p className="muted small">{formatFull(date)}</p>
        <Field label="Специалист">
          <select
            value={specId}
            onChange={(e) => {
              setSpecId(e.target.value)
              setServiceId('')
              setStart('')
            }}
          >
            <option value="">— выберите —</option>
            {db.specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {specialistName(s, A)}
              </option>
            ))}
          </select>
        </Field>
        {spec && (
          <Field label="Услуга">
            <select
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value)
                setStart('')
              }}
            >
              <option value="">— выберите —</option>
              {availableServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {pick(s.name, A)} · {duration(s.durationMin)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {spec && service && (
          <div className="field">
            <span className="field-label">Время</span>
            {slots.length === 0 ? (
              <div className="muted small">Нет свободных слотов в этот день (проверьте расписание специалиста).</div>
            ) : (
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    className={`slot${start === s.start ? ' active' : ''}`}
                    onClick={() => setStart(s.start)}
                  >
                    {s.start}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Field label="Имя клиента (необязательно)">
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </Field>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!spec || !service || !start || busy}>
            {busy ? 'Создаём…' : 'Создать запись'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
