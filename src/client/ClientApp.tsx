import { useEffect, useState } from 'react'
import { useDB, addBooking, uid } from '../db'
import { Avatar, money, duration } from '../ui'
import { navigate } from '../router'
import { isRemote } from '../config'
import { enterClient } from '../session'
import * as remote from '../remote'
import { addMinutes, formatFull } from '../time'
import { BookingWizard, type Flow } from './BookingWizard'
import type { Booking, BookingForm } from '../types'

type Screen =
  | { kind: 'landing' }
  | { kind: 'wizard'; flow: Flow }
  | { kind: 'done'; booking: Booking }

export function ClientApp(_props: { path: string }) {
  const db = useDB()
  const [screen, setScreen] = useState<Screen>({ kind: 'landing' })
  const [loading, setLoading] = useState(isRemote())

  // remote-режим: грузим публичные данные витрины (без персональных данных).
  useEffect(() => {
    if (!isRemote()) return
    let alive = true
    enterClient()
      .catch((e) => console.error('Не удалось загрузить данные:', e))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const configured = db.services.length > 0 && db.specialists.length > 0

  const book = async (
    v: { serviceId: string; specialistId: string; date: string; start: string } & BookingForm,
  ) => {
    const svc = db.services.find((s) => s.id === v.serviceId)!
    if (isRemote()) {
      // Бронь создаёт сервер (валидирует занятость, пишет в приватный репозиторий).
      try {
        const booking = await remote.submitBooking({
          specialistId: v.specialistId,
          serviceId: v.serviceId,
          date: v.date,
          start: v.start,
          clientName: v.clientName,
          clientPhone: v.clientPhone,
          clientEmail: v.clientEmail || undefined,
          comment: v.comment || undefined,
          consent: v.consent,
        })
        setScreen({ kind: 'done', booking })
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось создать запись. Попробуйте другое время.')
      }
      return
    }
    const booking: Booking = {
      id: uid(),
      specialistId: v.specialistId,
      serviceId: v.serviceId,
      date: v.date,
      start: v.start,
      end: addMinutes(v.start, svc.durationMin),
      status: 'confirmed',
      clientName: v.clientName,
      clientPhone: v.clientPhone || undefined,
      clientEmail: v.clientEmail || undefined,
      comment: v.comment || undefined,
      consent: v.consent,
      createdAt: Date.now(),
    }
    addBooking(booking)
    setScreen({ kind: 'done', booking })
  }

  return (
    <div className="client">
      <Banner />
      <div className="client-content">
        {loading && (
          <div className="landing">
            <div className="empty">
              <div className="spinner" />
              <p className="muted">Загрузка…</p>
            </div>
          </div>
        )}
        {!loading && screen.kind === 'landing' && (
          <Landing
            configured={configured}
            onStart={(flow) => setScreen({ kind: 'wizard', flow })}
          />
        )}
        {screen.kind === 'wizard' && (
          <BookingWizard
            flow={screen.flow}
            onExit={() => setScreen({ kind: 'landing' })}
            onBooked={book}
          />
        )}
        {screen.kind === 'done' && (
          <DoneScreen booking={screen.booking} onAgain={() => setScreen({ kind: 'landing' })} />
        )}
      </div>
      <footer className="client-footer">
        <button className="linkbtn" onClick={() => navigate('/admin')}>
          Вход для сотрудников
        </button>
      </footer>
    </div>
  )
}

function Banner() {
  const db = useDB()
  const { brand } = db
  return (
    <header
      className="client-banner"
      style={brand.banner ? { backgroundImage: `url(${brand.banner})` } : undefined}
    >
      <div className="client-banner-overlay">
        <div className="brand-avatar">
          <Avatar src={brand.avatar} name={brand.name} size={72} />
        </div>
        <h1 className="brand-name">{brand.name}</h1>
        <div className="brand-address">📍 {brand.address}</div>
      </div>
    </header>
  )
}

function Landing({
  configured,
  onStart,
}: {
  configured: boolean
  onStart: (flow: Flow) => void
}) {
  if (!configured) {
    return (
      <div className="landing">
        <div className="empty">
          <div className="empty-emoji">🛠️</div>
          <p>Салон ещё настраивается. Загляните чуть позже — скоро можно будет записаться онлайн.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="landing">
      <p className="landing-lead">Онлайн-запись за минуту. С чего начнём?</p>
      <div className="entry-buttons">
        <button className="entry-btn" onClick={() => onStart('master')}>
          <span className="entry-icon">🧑‍⚕️</span>
          <span className="entry-label">Мастер</span>
          <span className="entry-sub">Выбрать мастера, потом услугу и время</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('date')}>
          <span className="entry-icon">📅</span>
          <span className="entry-label">Выбрать дату</span>
          <span className="entry-sub">Свободные дата и время → услуга → мастер</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('service')}>
          <span className="entry-icon">💆</span>
          <span className="entry-label">Выбрать услугу</span>
          <span className="entry-sub">Услуга → мастер → дата и время</span>
        </button>
      </div>
      <ServicesShowcase />
    </div>
  )
}

function ServicesShowcase() {
  const db = useDB()
  if (db.services.length === 0) return null
  return (
    <section className="showcase">
      <h3>Наши услуги</h3>
      <div className="showcase-grid">
        {db.services.map((s) => (
          <div className="showcase-card" key={s.id}>
            <div
              className="showcase-img"
              style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}
            >
              {!s.image && <span>💆</span>}
            </div>
            <div className="showcase-body">
              <div className="showcase-title">{s.name}</div>
              <div className="showcase-meta">
                <span>{duration(s.durationMin)}</span>
                <span className="showcase-price">{money(s.price)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DoneScreen({ booking, onAgain }: { booking: Booking; onAgain: () => void }) {
  const db = useDB()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
  return (
    <div className="done">
      <div className="done-check">✓</div>
      <h2>Вы записаны!</h2>
      <p className="muted">Запись подтверждена автоматически.</p>
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
            {formatFull(booking.date)}, {booking.start}–{booking.end}
          </b>
        </div>
        {booking.clientName && (
          <div className="confirm-row">
            <span>Имя</span>
            <b>{booking.clientName}</b>
          </div>
        )}
      </div>
      <button className="btn btn-primary btn-block" onClick={onAgain}>
        Записаться ещё раз
      </button>
    </div>
  )
}
