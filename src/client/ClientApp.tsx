import { useEffect, useState } from 'react'
import { useDB, addBooking, uid } from '../db'
import { Avatar } from '../ui'
import { isRemote } from '../config'
import { enterClient } from '../session'
import * as remote from '../remote'
import { useI18n, fmtFull, LangSelect } from '../i18n'
import { Icon } from '../icons'
import { pick, specialistName } from '../localized'
import { addMinutes } from '../time'
import { navigate } from '../router'
import { googleCalUrl, outlookCalUrl, icsDataUri, type CalEvent } from './calendar'
import { saveProfile } from './profile'
import { BookingWizard, type Flow } from './BookingWizard'
import type { Booking, BookingForm } from '../types'

type Screen =
  | { kind: 'landing' }
  | { kind: 'wizard'; flow: Flow }
  | { kind: 'done'; booking: Booking }

export function ClientApp({ path }: { path: string }) {
  const db = useDB()
  const { t, lang } = useI18n()
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
    // Запоминаем контакты для подстановки при следующей записи (в браузере клиента).
    saveProfile({ clientName: v.clientName, clientPhone: v.clientPhone, clientEmail: v.clientEmail })
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
          lang,
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
      lang,
      createdAt: Date.now(),
    }
    addBooking(booking)
    setScreen({ kind: 'done', booking })
  }

  // Самостоятельная отмена по ссылке из письма: #/cancel?id=..&t=..
  if (path.startsWith('/cancel')) {
    const q = new URLSearchParams(path.split('?')[1] || '')
    return (
      <div className="client">
        <CancelScreen id={q.get('id') || ''} token={q.get('t') || ''} />
      </div>
    )
  }

  // В процессе записи — своя компактная прилипающая шапка (внутри BookingWizard).
  if (screen.kind === 'wizard') {
    return (
      <div className="client">
        <BookingWizard flow={screen.flow} onExit={() => setScreen({ kind: 'landing' })} onBooked={book} />
      </div>
    )
  }

  return (
    <div className="client">
      <Banner loading={loading} />
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

function Banner({ loading }: { loading: boolean }) {
  const db = useDB()
  const { lang } = useI18n()
  const { brand } = db
  const name = pick(brand.name, lang)
  const address = pick(brand.address, lang)

  // Пока данные грузятся с сервера — скелетоны вместо дефолтного текста,
  // чтобы не проскакивало «Massage studio».
  if (loading) {
    return (
      <header className="client-banner">
        <LangSelect className="banner-lang" />
        <div className="client-banner-overlay">
          <div className="skel skel-avatar" />
          <div className="skel skel-line" style={{ width: 160, height: 22, marginTop: 12 }} />
          <div className="skel skel-line" style={{ width: 200, height: 13, marginTop: 8 }} />
        </div>
      </header>
    )
  }

  return (
    <header
      className="client-banner"
      style={brand.banner ? { backgroundImage: `url(${brand.banner})` } : undefined}
    >
      <LangSelect className="banner-lang" />
      <div className="client-banner-overlay">
        <div className="brand-avatar">
          <Avatar src={brand.avatar} name={name} size={96} />
        </div>
        <h1 className="brand-name">{name}</h1>
        {address && <div className="brand-address">{address}</div>}
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
          <div className="empty-emoji"><Icon name="wrench" size={44} /></div>
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
          <span className="entry-icon" aria-hidden>
            <Icon name="user" size={22} />
          </span>
          <span className="entry-label">{t('entry.master')}</span>
          <span className="entry-sub">{t('entry.master.sub')}</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('date')}>
          <span className="entry-icon" aria-hidden>
            <Icon name="calendar" size={22} />
          </span>
          <span className="entry-label">{t('entry.date')}</span>
          <span className="entry-sub">{t('entry.date.sub')}</span>
        </button>
        <button className="entry-btn" onClick={() => onStart('service')}>
          <span className="entry-icon" aria-hidden>
            <Icon name="list" size={22} />
          </span>
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
  const brand = pick(db.brand.name, lang)
  const address = pick(db.brand.address, lang)
  const evt: CalEvent = {
    title: `${svc ? pick(svc.name, lang) : ''} — ${brand}`,
    details: sp ? `${t('label.specialist')}: ${specialistName(sp, lang)}` : '',
    location: address,
    date: booking.date,
    start: booking.start,
    end: booking.end,
  }
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
      <div className="cal-add">
        <span className="cal-add-label">{t('cal.add')}</span>
        <div className="cal-add-btns">
          <a className="btn btn-sm" href={googleCalUrl(evt)} target="_blank" rel="noopener noreferrer">
            {t('cal.google')}
          </a>
          <a className="btn btn-sm" href={icsDataUri(evt)} download="booking.ics">
            {t('cal.apple')}
          </a>
          <a className="btn btn-sm" href={outlookCalUrl(evt)} target="_blank" rel="noopener noreferrer">
            {t('cal.outlook')}
          </a>
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={onAgain}>
        {t('done.again')}
      </button>
    </div>
  )
}

// Страница самостоятельной отмены записи (открывается по ссылке из письма).
type CancelState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gone' }
  | { kind: 'ready'; info: remote.BookingLookup }
  | { kind: 'cancelled' }

function CancelScreen({ id, token }: { id: string; token: string }) {
  const { t, lang } = useI18n()
  const [state, setState] = useState<CancelState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isRemote() || !id || !token) {
      setState({ kind: 'error' })
      return
    }
    let alive = true
    remote
      .lookupBooking(id, token)
      .then((r) => alive && setState(r.booking ? { kind: 'ready', info: r } : { kind: 'gone' }))
      .catch(() => alive && setState({ kind: 'error' }))
    return () => {
      alive = false
    }
  }, [id, token])

  const doCancel = async () => {
    if (!confirm(t('cancel.confirm'))) return
    setBusy(true)
    try {
      await remote.cancelBookingPublic(id, token)
      setState({ kind: 'cancelled' })
    } catch {
      setState({ kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const toStudio = (
    <button className="btn btn-block" onClick={() => navigate('/')}>
      {t('cancel.toStudio')}
    </button>
  )

  return (
    <>
      <header className="client-banner">
        <LangSelect className="banner-lang" />
        <div className="client-banner-overlay">
          <h1 className="brand-name">{state.kind === 'ready' ? state.info.brand : 'NEBA'}</h1>
        </div>
      </header>
      <div className="client-content">
        <div className="cancel-page">
          {state.kind === 'loading' && (
            <div className="empty">
              <div className="spinner" />
              <p className="muted">{t('cancel.loading')}</p>
            </div>
          )}
          {state.kind === 'error' && (
            <div className="empty">
              <div className="empty-emoji">
                <Icon name="lock" size={44} />
              </div>
              <p>{t('cancel.invalid')}</p>
              {toStudio}
            </div>
          )}
          {state.kind === 'gone' && (
            <div className="done">
              <div className="done-check">✓</div>
              <h2>{t('cancel.done.title')}</h2>
              <p className="muted">{t('cancel.gone')}</p>
              {toStudio}
            </div>
          )}
          {state.kind === 'cancelled' && (
            <div className="done">
              <div className="done-check">✓</div>
              <h2>{t('cancel.done.title')}</h2>
              <p className="muted">{t('cancel.done.sub')}</p>
              {toStudio}
            </div>
          )}
          {state.kind === 'ready' && (
            <>
              <h2 className="wiz-title">{t('cancel.heading')}</h2>
              <div className="confirm-card">
                <div className="confirm-row">
                  <span>{t('label.service')}</span>
                  <b>{state.info.service}</b>
                </div>
                <div className="confirm-row">
                  <span>{t('label.specialist')}</span>
                  <b>{state.info.master}</b>
                </div>
                <div className="confirm-row">
                  <span>{t('label.when')}</span>
                  <b>
                    {fmtFull(state.info.booking!.date, lang)}, {state.info.booking!.start}–{state.info.booking!.end}
                  </b>
                </div>
                {state.info.address && (
                  <div className="confirm-row">
                    <span>{t('label.address')}</span>
                    <b>{state.info.address}</b>
                  </div>
                )}
              </div>
              <button className="btn btn-danger btn-block btn-lg" disabled={busy} onClick={doCancel}>
                {t('cancel.button')}
              </button>
              <button className="btn btn-block" onClick={() => navigate('/')}>
                {t('cancel.keep')}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
