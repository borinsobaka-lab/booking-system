import { useEffect, useState } from 'react'
import { useDB, addBooking, uid } from '../db'
import { Avatar } from '../ui'
import { isRemote } from '../config'
import { enterClient } from '../session'
import * as remote from '../remote'
import { useI18n, fmtFull, LANGS } from '../i18n'
import { pick, specialistName } from '../localized'
import { addMinutes } from '../time'
import { BookingWizard, type Flow } from './BookingWizard'
import type { Booking, BookingForm } from '../types'

type Screen =
  | { kind: 'landing' }
  | { kind: 'wizard'; flow: Flow }
  | { kind: 'done'; booking: Booking }

export function ClientApp(_props: { path: string }) {
  const db = useDB()
  const { t } = useI18n()
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
        alert(e instanceof Error ? e.message : t('error.booking'))
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

  // В процессе записи — своя компактная прилипающая шапка (внутри BookingWizard).
  if (screen.kind === 'wizard') {
    return (
      <div className="client">
        <LangSwitcher />
        <BookingWizard flow={screen.flow} onExit={() => setScreen({ kind: 'landing' })} onBooked={book} />
      </div>
    )
  }

  return (
    <div className="client">
      <LangSwitcher />
      <Banner />
      <div className="client-content">
        {loading && (
          <div className="landing">
            <div className="empty">
              <div className="spinner" />
              <p className="muted">{t('loading')}</p>
            </div>
          </div>
        )}
        {!loading && screen.kind === 'landing' && (
          <Landing configured={configured} onStart={(flow) => setScreen({ kind: 'wizard', flow })} />
        )}
        {screen.kind === 'done' && (
          <DoneScreen booking={screen.booking} onAgain={() => setScreen({ kind: 'landing' })} />
        )}
      </div>
    </div>
  )
}

function LangSwitcher() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-switcher">
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={`lang-btn${lang === l.code ? ' active' : ''}`}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function Banner() {
  const db = useDB()
  const { lang } = useI18n()
  const { brand } = db
  const name = pick(brand.name, lang)
  const address = pick(brand.address, lang)
  return (
    <header
      className="client-banner"
      style={brand.banner ? { backgroundImage: `url(${brand.banner})` } : undefined}
    >
      <div className="client-banner-overlay">
        <div className="brand-avatar">
          <Avatar src={brand.avatar} name={name} size={96} />
        </div>
        <h1 className="brand-name">{name}</h1>
        {address && <div className="brand-address">📍 {address}</div>}
      </div>
    </header>
  )
}

function Landing({ configured, onStart }: { configured: boolean; onStart: (flow: Flow) => void }) {
  const { t } = useI18n()
  if (!configured) {
    return (
      <div className="landing">
        <div className="empty">
          <div className="empty-emoji">🛠️</div>
          <p>{t('notConfigured')}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="landing">
      <p className="landing-lead">{t('landing.lead')}</p>
      <div className="entry-buttons">
        <button className="entry-btn" onClick={() => onStart('master')}>
          <span className="entry-icon" aria-hidden />
          <span className="entry-label">{t('entry.master')}</span>
          <span className="entry-sub">{t('entry.master.sub')}</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('date')}>
          <span className="entry-icon" aria-hidden />
          <span className="entry-label">{t('entry.date')}</span>
          <span className="entry-sub">{t('entry.date.sub')}</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('service')}>
          <span className="entry-icon" aria-hidden />
          <span className="entry-label">{t('entry.service')}</span>
          <span className="entry-sub">{t('entry.service.sub')}</span>
        </button>
      </div>
    </div>
  )
}

function DoneScreen({ booking, onAgain }: { booking: Booking; onAgain: () => void }) {
  const db = useDB()
  const { lang, t } = useI18n()
  const svc = db.services.find((s) => s.id === booking.serviceId)
  const sp = db.specialists.find((s) => s.id === booking.specialistId)
  return (
    <div className="done">
      <div className="done-check">✓</div>
      <h2>{t('done.title')}</h2>
      <p className="muted">{t('done.sub')}</p>
      <div className="confirm-card">
        <div className="confirm-row">
          <span>{t('label.service')}</span>
          <b>{svc && pick(svc.name, lang)}</b>
        </div>
        <div className="confirm-row">
          <span>{t('label.specialist')}</span>
          <b>{sp ? specialistName(sp, lang) : ''}</b>
        </div>
        <div className="confirm-row">
          <span>{t('label.when')}</span>
          <b>
            {fmtFull(booking.date, lang)}, {booking.start}–{booking.end}
          </b>
        </div>
        {booking.clientName && (
          <div className="confirm-row">
            <span>{t('label.name')}</span>
            <b>{booking.clientName}</b>
          </div>
        )}
      </div>
      <button className="btn btn-primary btn-block" onClick={onAgain}>
        {t('done.again')}
      </button>
    </div>
  )
}
