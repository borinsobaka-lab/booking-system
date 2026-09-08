import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDB, cancelBookingLocal, setBookingPaidLocal, setBookingMembershipLocal, addBooking, uid } from '../db'
import { isRemote } from '../config'
import * as remote from '../remote'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import { Avatar, Field, Modal, money, duration } from '../ui'
import { todayKey, formatFull, weekdayLong, formatDayMonth, toMinutes, addMinutes } from '../time'
import { freeSlots } from '../availability'
import { payoutRate } from '../payout'
import { pick, specialistName } from '../localized'
import { Icon } from '../icons'
import type { Booking, Lang } from '../types'

const A: Lang = 'ru' // отображение контента в админке

type Tab = 'current' | 'past' | 'cancelled'

/** Прошёл ли сеанс к текущему моменту (по локальным часам админа). */
function isPast(b: Booking, nowKey: string, nowMin: number): boolean {
  return b.date < nowKey || (b.date === nowKey && toMinutes(b.end) <= nowMin)
}

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

const PAGE_SIZE = 30

/** Кусочный показ длинного списка: рендерим по PAGE_SIZE, чтобы не лагало. */
function usePaged<T>(items: T[], step = PAGE_SIZE) {
  const [count, setCount] = useState(step)
  const loadMore = useCallback(() => setCount((c) => c + step), [step])
  return { visible: items.slice(0, count), shown: Math.min(count, items.length), total: items.length, hasMore: items.length > count, loadMore }
}

/** Кнопка «Показать ещё» + автоподгрузка при подходе к концу списка. */
function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const cb = useRef(onMore)
  cb.current = onMore
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), { rootMargin: '320px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div className="load-more" ref={ref}>
      <button className="btn btn-sm" onClick={onMore}>
        Показать ещё
      </button>
      <span className="muted small">
        Показано {shown} из {total}
      </span>
    </div>
  )
}

export function BookingsPage() {
  const db = useDB()
  const { canManageBookings, scopedSpecialistId } = useAuth()
  const [deny, denyModal] = useDeny()
  const [tab, setTab] = useState<Tab>('current')
  const [detail, setDetail] = useState<Booking | null>(null)
  const [adding, setAdding] = useState(false)
  // Фильтр по мастеру — для тех, кто видит всех (владелец, администратор).
  const [specFilter, setSpecFilter] = useState<string>('all')

  // Мастер видит только свои записи; остальные — все (с фильтром по мастеру).
  const mine = useMemo(
    () => (scopedSpecialistId ? db.bookings.filter((b) => b.specialistId === scopedSpecialistId) : db.bookings),
    [db.bookings, scopedSpecialistId],
  )
  const listed = useMemo(
    () => (scopedSpecialistId || specFilter === 'all' ? mine : mine.filter((b) => b.specialistId === specFilter)),
    [mine, scopedSpecialistId, specFilter],
  )

  // Номера визитов считаем по всем доступным записям, не по отфильтрованным.
  const visits = useMemo(() => computeVisits(mine), [mine])
  const today = todayKey()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const confirmed = listed.filter((b) => b.status !== 'cancelled')
  // Текущие: ещё не прошедшие. Лента — сегодня всегда + будущие дни с записями.
  const current = confirmed.filter((b) => !isPast(b, today, nowMin))
  const feedDates = [...new Set([today, ...current.map((b) => b.date)])].sort()
  // Прошедшие: сеанс уже состоялся; свежие сверху.
  const past = confirmed
    .filter((b) => isPast(b, today, nowMin))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.start < a.start ? -1 : 1))

  const cancel = async (b: Booking) => {
    if (!canManageBookings) return deny()
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

  const togglePaid = async (b: Booking, paid: boolean) => {
    if (!canManageBookings) return deny()
    if (isRemote()) {
      try {
        await remote.setBookingPaid(b.id, paid)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось изменить статус оплаты')
        return
      }
    }
    setBookingPaidLocal(b.id, paid)
    setDetail((d) => (d && d.id === b.id ? { ...d, paidAt: paid ? Date.now() : undefined } : d))
  }

  const toggleMembership = async (b: Booking, on: boolean) => {
    if (!canManageBookings) return deny()
    if (isRemote()) {
      try {
        await remote.setBookingMembership(b.id, on)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось изменить отметку')
        return
      }
    }
    setBookingMembershipLocal(b.id, on)
    setDetail((d) => (d && d.id === b.id ? { ...d, membership: on || undefined } : d))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Записи</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (canManageBookings ? setAdding(true) : deny())}
          disabled={db.specialists.length === 0}
        >
          + Запись
        </button>
      </header>

      <div className="segmented book-tabs">
        <button className={tab === 'current' ? 'active' : ''} onClick={() => setTab('current')}>
          Текущие
        </button>
        <button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>
          Прошедшие
        </button>
        <button className={tab === 'cancelled' ? 'active' : ''} onClick={() => setTab('cancelled')}>
          Отмены
        </button>
      </div>

      {/* Кто видит всех — может смотреть по конкретному мастеру. */}
      {!scopedSpecialistId && db.specialists.length > 1 && (
        <div className="spec-picker book-specfilter">
          <button
            className={`spec-pill${specFilter === 'all' ? ' active' : ''}`}
            onClick={() => setSpecFilter('all')}
          >
            <span>Все мастера</span>
          </button>
          {db.specialists.map((sp) => (
            <button
              key={sp.id}
              className={`spec-pill${specFilter === sp.id ? ' active' : ''}`}
              onClick={() => setSpecFilter(sp.id)}
            >
              <Avatar src={sp.avatar} name={specialistName(sp, A)} size={24} />
              <span>{specialistName(sp, A)}</span>
            </button>
          ))}
        </div>
      )}

      {db.specialists.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="calendarDays" size={44} />
          </div>
          <p>Добавьте специалистов и задайте им расписание — тогда здесь появятся записи.</p>
        </div>
      ) : tab === 'current' ? (
        <div className="feed">
          {feedDates.map((date) => {
            const items = current.filter((b) => b.date === date).sort(byStart)
            const isToday = date === today
            return (
              <section className="feed-day" key={date}>
                <div className="feed-day-head">
                  <div className="feed-day-title">{isToday ? 'Сегодня' : formatDayMonth(date)}</div>
                  <div className="feed-day-sub">
                    {isToday ? 'Предстоящие' : weekdayLong(date)}
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
      ) : tab === 'past' ? (
        <PastTab past={past} canEdit={canManageBookings} onOpen={setDetail} onTogglePaid={togglePaid} />
      ) : (
        <BookingTable
          bookings={listed
            .filter((b) => b.status === 'cancelled')
            .sort((a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0))}
          onOpen={setDetail}
          emptyText="Отменённых записей нет."
        />
      )}

      {detail && (
        <BookingDetail
          booking={detail}
          canEdit={canManageBookings}
          isPast={isPast(detail, today, nowMin)}
          onCancel={cancel}
          onTogglePaid={togglePaid}
          onToggleMembership={toggleMembership}
          onClose={() => setDetail(null)}
        />
      )}
      {adding && <ManualBooking today={today} onClose={() => setAdding(false)} />}
      {denyModal}
    </div>
  )
}

/** Вкладка «Прошедшие»: сводка по выплатам массажистам + список сеансов.
 *  Владелец и администратор видят суммы по всем мастерам, мастер — только свои
 *  (в `past` ему приходят только его сеансы). */
function PastTab({
  past,
  canEdit,
  onOpen,
  onTogglePaid,
}: {
  past: Booking[]
  canEdit: boolean
  onOpen: (b: Booking) => void
  onTogglePaid: (b: Booking, paid: boolean) => void
}) {
  const db = useDB()
  const { scopedSpecialistId } = useAuth()
  const paged = usePaged(past)
  // Сводка считается по ВСЕМ прошедшим (не только по показанным). Ставка может
  // отличаться от мастера к мастеру, поэтому суммируем по каждой записи.
  const paidCount = past.filter((b) => b.paidAt).length
  const unpaidCount = past.length - paidCount
  const remaining = past.reduce((sum, b) => (b.paidAt ? sum : sum + payoutRate(db, b.specialistId)), 0)

  // Разбивка по мастерам: сколько сеансов, сколько уже выплачено и сколько ещё.
  const perSpec = new Map<string, { total: number; paid: number; rem: number; sum: number }>()
  for (const b of past) {
    const st = perSpec.get(b.specialistId) || { total: 0, paid: 0, rem: 0, sum: 0 }
    const r = payoutRate(db, b.specialistId)
    st.total += 1
    st.sum += r
    if (b.paidAt) st.paid += 1
    else st.rem += r
    perSpec.set(b.specialistId, st)
  }

  if (past.length === 0) return <div className="feed-empty muted">Прошедших сеансов пока нет.</div>

  return (
    <div className="past">
      <div className="payout">
        <div className="payout-head">
          <div>
            <div className="payout-remaining">{money(remaining)}</div>
            <div className="muted small">
              {scopedSpecialistId ? 'осталось получить за проведённые сеансы' : 'осталось перевести массажистам'}
            </div>
          </div>
          <div className="payout-counts">
            <div>
              Прошло <b>{past.length}</b> сеанс.
            </div>
            <div className="muted small">
              оплачено {paidCount} · осталось {unpaidCount}
            </div>
          </div>
        </div>
        {perSpec.size > 1 && (
          <div className="payout-specs">
            {db.specialists
              .filter((sp) => perSpec.has(sp.id))
              .map((sp) => {
                const st = perSpec.get(sp.id)!
                return (
                  <div className="payout-spec" key={sp.id}>
                    <span className="payout-spec-name">{specialistName(sp, A)}</span>
                    <span className="muted small">
                      {st.paid}/{st.total} оплачено · всего {money(st.sum)} · {money(payoutRate(db, sp.id))}/сеанс
                    </span>
                    <b className={st.rem === 0 ? 'muted' : ''}>{money(st.rem)}</b>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <div className="past-list">
        {paged.visible.map((b) => (
          <PastRow key={b.id} booking={b} canEdit={canEdit} onOpen={() => onOpen(b)} onTogglePaid={onTogglePaid} />
        ))}
      </div>
      {paged.hasMore && <LoadMore shown={paged.shown} total={paged.total} onMore={paged.loadMore} />}
    </div>
  )
}

function PastRow({
  booking,
  canEdit,
  onOpen,
  onTogglePaid,
}: {
  booking: Booking
  canEdit: boolean
  onOpen: () => void
  onTogglePaid: (b: Booking, paid: boolean) => void
}) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const rate = payoutRate(db, booking.specialistId)
  const paid = !!booking.paidAt
  return (
    <div className={`past-row${paid ? ' paid' : ''}`}>
      <button className="past-row-main" onClick={onOpen}>
        <div className="bh-date">
          <b>{formatDayMonth(booking.date)}</b>
          <span className="muted">{booking.start}</span>
        </div>
        <div className="bh-main">
          <div>
            {booking.clientName || 'Без имени'}
            {booking.membership && <span className="badge badge-sub">по абонементу</span>}
          </div>
          <div className="muted small">{svc ? pick(svc.name, A) : '—'}</div>
        </div>
        <SpecBadge specialistId={booking.specialistId} size={30} />
      </button>
      <div className="past-pay">
        {paid ? (
          <>
            <span className="badge badge-ok">Оплачено</span>
            {canEdit && (
              <button className="linkbtn undo-pay" title="Отменить оплату" onClick={() => onTogglePaid(booking, false)}>
                отменить
              </button>
            )}
          </>
        ) : canEdit ? (
          <button className="btn btn-sm btn-pay" onClick={() => onTogglePaid(booking, true)}>
            Оплатить · {money(rate)}
          </button>
        ) : (
          <span className="muted small">{money(rate)}</span>
        )}
      </div>
    </div>
  )
}

/** Аватар мастера в правой части карточки — сразу видно, к кому запись.
 *  Под аватаром имя (без фамилии, чтобы не обрезалось), полное — в подсказке. */
function SpecBadge({ specialistId, size = 34 }: { specialistId: string; size?: number }) {
  const db = useDB()
  const sp = db.specialists.find((s) => s.id === specialistId)
  if (!sp) return null
  const full = specialistName(sp, A)
  const short = pick(sp.firstName, A) || full
  return (
    <div className="card-spec" title={full}>
      <Avatar src={sp.avatar} name={full} size={size} />
      <span className="card-spec-name">{short}</span>
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
          {booking.membership && <span className="badge badge-sub">по абонементу</span>}
          {vl.badge && <span className={`badge ${vl.badgeClass || ''}`}>{vl.badge}</span>}
        </div>
        {vl.text && <div className="feed-card-visit muted">{vl.text}</div>}
        <div className="feed-card-svc">{svc ? pick(svc.name, A) : 'Услуга'}</div>
      </div>
      <SpecBadge specialistId={booking.specialistId} />
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
  const paged = usePaged(bookings)
  if (bookings.length === 0) return <div className="feed-empty muted">{emptyText}</div>
  return (
    <div className="book-history">
      {paged.visible.map((b) => {
        const svc = db.services.find((s) => s.id === b.serviceId)
        return (
          <button className="book-history-row" key={b.id} onClick={() => onOpen(b)}>
            <div className="bh-date">
              <b>{formatDayMonth(b.date)}</b>
              <span className="muted">
                {b.start}–{b.end}
              </span>
            </div>
            <div className="bh-main">
              <div>
                {b.clientName || 'Без имени'}
                {b.membership && <span className="badge badge-sub">по абонементу</span>}
              </div>
              <div className="muted small">{svc ? pick(svc.name, A) : '—'}</div>
            </div>
            <SpecBadge specialistId={b.specialistId} size={30} />
            <span className={`badge ${b.status === 'cancelled' ? '' : 'badge-ok'}`}>
              {b.status === 'cancelled' ? 'отменена' : 'активна'}
            </span>
          </button>
        )
      })}
      {paged.hasMore && <LoadMore shown={paged.shown} total={paged.total} onMore={paged.loadMore} />}
    </div>
  )
}

function BookingDetail({
  booking,
  canEdit,
  isPast,
  onCancel,
  onTogglePaid,
  onToggleMembership,
  onClose,
}: {
  booking: Booking
  canEdit: boolean
  isPast: boolean
  onCancel: (b: Booking) => void
  onTogglePaid: (b: Booking, paid: boolean) => void
  onToggleMembership: (b: Booking, on: boolean) => void
  onClose: () => void
}) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
  const rate = payoutRate(db, booking.specialistId)
  const cancelled = booking.status === 'cancelled'
  const paid = !!booking.paidAt
  const membership = !!booking.membership
  const showPayout = isPast && !cancelled
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
          <dd className="detail-spec">
            {sp ? (
              <>
                <Avatar src={sp.avatar} name={specialistName(sp, A)} size={26} />
                {specialistName(sp, A)}
              </>
            ) : (
              '—'
            )}
          </dd>
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
            {membership && <span className="badge badge-sub">по абонементу</span>}
          </dd>
          {showPayout && (
            <>
              <dt>Оплата массажисту</dt>
              <dd>
                {paid ? (
                  <span className="badge badge-ok">оплачено · {money(rate)}</span>
                ) : (
                  <span className="muted">не оплачено · {money(rate)}</span>
                )}
              </dd>
            </>
          )}
        </dl>
        <div className="form-actions">
          {!cancelled && canEdit && (
            <button className="btn" onClick={() => onToggleMembership(booking, !membership)}>
              {membership ? 'Снять «по абонементу»' : 'Отметить по абонементу'}
            </button>
          )}
          {showPayout && canEdit && (
            <button
              className={paid ? 'btn' : 'btn btn-pay'}
              onClick={() => onTogglePaid(booking, !paid)}
            >
              {paid ? 'Отменить оплату' : `Оплатить · ${money(rate)}`}
            </button>
          )}
          {!cancelled && !isPast && canEdit && (
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

function ManualBooking({ today, onClose }: { today: string; onClose: () => void }) {
  const db = useDB()
  const [date, setDate] = useState(today)
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
        <Field label="Дата">
          <input type="date" value={date} min={today} onChange={(e) => { setDate(e.target.value || today); setStart('') }} />
        </Field>
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
              <div className="muted small">
                Нет свободных слотов в этот день: проверьте расписание специалиста и занятость кабинета
                (в одно время идёт не больше сеансов, чем кабинетов).
              </div>
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
