import { useMemo, useState } from 'react'
import { useDB, deleteBooking, addBooking, uid } from '../db'
import { Avatar, Field, Modal, money, duration } from '../ui'
import { navigate, ADMIN_BASE } from '../router'
import { todayKey, addDays, formatFull, toMinutes, addMinutes } from '../time'
import { freeSlots } from '../availability'
import { PX_PER_MIN, TIMELINE_HEIGHT, hourMarks, minToY } from './timeline'
import type { Booking } from '../types'

export function BookingsPage() {
  const db = useDB()
  const [date, setDate] = useState(todayKey())
  const [detail, setDetail] = useState<Booking | null>(null)
  const [adding, setAdding] = useState(false)

  const dayBookings = db.bookings.filter((b) => b.date === date)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Записи</h1>
          <p className="muted small">
            {formatFull(date)} · {dayBookings.length}{' '}
            {plural(dayBookings.length, 'запись', 'записи', 'записей')}
          </p>
        </div>
        <div className="head-actions">
          <div className="week-nav">
            <button className="iconbtn" onClick={() => setDate(addDays(date, -1))}>
              ‹
            </button>
            <button className="btn btn-sm" onClick={() => setDate(todayKey())}>
              Сегодня
            </button>
            <button className="iconbtn" onClick={() => setDate(addDays(date, 1))}>
              ›
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)} disabled={db.specialists.length === 0}>
            + Запись
          </button>
        </div>
      </header>

      {db.specialists.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">📅</div>
          <p>Добавьте специалистов и задайте им расписание — тогда здесь появятся рабочие дни и записи.</p>
        </div>
      ) : (
        <div className="timeline">
          <div className="tl-ruler" style={{ height: TIMELINE_HEIGHT }}>
            {hourMarks().map((m) => (
              <div key={m.min} className="tl-hour" style={{ top: minToY(m.min) }}>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
          <div className="tl-days">
            {db.specialists.map((sp) => {
              const sched = db.schedules.find((s) => s.specialistId === sp.id && s.date === date)
              const working = !!sched && sched.windows.length > 0
              const bookings = dayBookings.filter((b) => b.specialistId === sp.id)
              return (
                <div key={sp.id} className="tl-day">
                  <div className="tl-day-head spec-head">
                    <Avatar src={sp.avatar} name={`${sp.firstName} ${sp.lastName}`} size={30} />
                    <div className="spec-head-info">
                      <div className="tl-day-name">
                        {sp.firstName} {sp.lastName}
                      </div>
                      <div className={`tl-day-status ${working ? 'work' : 'off'}`}>
                        {working ? 'рабочий день' : 'выходной'}
                      </div>
                    </div>
                  </div>
                  <div className="tl-col" style={{ height: TIMELINE_HEIGHT }}>
                    {hourMarks().map((m) => (
                      <div key={m.min} className="tl-gridline" style={{ top: minToY(m.min) }} />
                    ))}

                    {/* рабочие окна — светлый фон */}
                    {sched?.windows.map((w, i) => (
                      <div
                        key={`w${i}`}
                        className="tl-zone-work"
                        style={{ top: minToY(toMinutes(w.start)), height: (toMinutes(w.end) - toMinutes(w.start)) * PX_PER_MIN }}
                      />
                    ))}
                    {/* перерывы */}
                    {sched?.breaks.map((b, i) => (
                      <div
                        key={`b${i}`}
                        className="tl-zone-break"
                        style={{ top: minToY(toMinutes(b.start)), height: (toMinutes(b.end) - toMinutes(b.start)) * PX_PER_MIN }}
                      >
                        <span>перерыв</span>
                      </div>
                    ))}

                    {!working && (
                      <button className="tl-off-overlay" onClick={() => navigate(`${ADMIN_BASE}/schedule`)}>
                        Выходной
                        <span className="muted small">Назначить в расписании →</span>
                      </button>
                    )}

                    {/* записи */}
                    {bookings.map((bk) => {
                      const svc = db.services.find((s) => s.id === bk.serviceId)
                      return (
                        <button
                          key={bk.id}
                          className="tl-block tl-booking clickable"
                          style={{ top: minToY(toMinutes(bk.start)), height: (toMinutes(bk.end) - toMinutes(bk.start)) * PX_PER_MIN }}
                          onClick={() => setDetail(bk)}
                        >
                          <span className="tl-block-time">
                            {bk.start}–{bk.end}
                          </span>
                          <span className="tl-block-label">{svc?.name ?? 'Услуга'}</span>
                          {bk.clientName && <span className="tl-block-client">{bk.clientName}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {detail && <BookingDetail booking={detail} onClose={() => setDetail(null)} />}
      {adding && <ManualBooking date={date} onClose={() => setAdding(false)} />}
    </div>
  )
}

function BookingDetail({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
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
            {svc?.name ?? '—'} {svc && <span className="muted">· {money(svc.price)} · {duration(svc.durationMin)}</span>}
          </dd>
          <dt>Специалист</dt>
          <dd>{sp ? `${sp.firstName} ${sp.lastName}` : '—'}</dd>
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
            <span className="badge badge-ok">подтверждена</span>
          </dd>
        </dl>
        <div className="form-actions">
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Отменить эту запись?')) {
                deleteBooking(booking.id)
                onClose()
              }
            }}
          >
            Отменить запись
          </button>
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

  const spec = db.specialists.find((s) => s.id === specId)
  const availableServices = spec ? db.services.filter((s) => spec.serviceIds.includes(s.id)) : []
  const service = db.services.find((s) => s.id === serviceId)
  const slots = useMemo(
    () => (spec && service ? freeSlots(spec.id, date, service.durationMin) : []),
    [spec, service, date],
  )

  const save = () => {
    if (!spec || !service || !start) return
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
                {s.firstName} {s.lastName}
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
                  {s.name} · {duration(s.durationMin)}
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
          <button className="btn btn-primary" onClick={save} disabled={!spec || !service || !start}>
            Создать запись
          </button>
        </div>
      </div>
    </Modal>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
