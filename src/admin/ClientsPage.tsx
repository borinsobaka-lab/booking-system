import { useMemo, useState } from 'react'
import { useDB, setClientInviteLocal } from '../db'
import { isRemote } from '../config'
import * as remote from '../remote'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import { Avatar } from '../ui'
import { Icon } from '../icons'
import { formatDayMonth } from '../time'
import type { Booking } from '../types'

// Клиент считается «давно не был», если последний визит был раньше, чем N дней назад.
const RETURN_DAYS = 14
// Не даём слать приглашения чаще, чем раз в N дней.
const COOLDOWN_DAYS = 14
const DAY = 86_400_000

// Ключ клиента: телефон → email → имя (как в разделе «Записи»).
function clientKey(b: Booking): string {
  const phone = (b.clientPhone || '').replace(/[^\d]/g, '')
  if (phone) return 'p:' + phone
  if (b.clientEmail) return 'e:' + b.clientEmail.trim().toLowerCase()
  return 'n:' + (b.clientName || '').trim().toLowerCase()
}

function daysAgoFromDate(dateKey: string): number {
  const ms = Date.parse(dateKey + 'T00:00:00Z')
  if (Number.isNaN(ms)) return 0
  return Math.floor((Date.now() - ms) / DAY)
}
function daysAgoFromMs(ms: number): number {
  return Math.floor((Date.now() - ms) / DAY)
}
function humanAgo(n: number): string {
  if (n <= 0) return 'сегодня'
  if (n === 1) return 'вчера'
  return `${n} дн. назад`
}

interface Client {
  name: string
  phone: string
  email: string
  lastDate: string
  visits: number
}

export function ClientsPage() {
  const db = useDB()
  const { canManage } = useAuth()
  const [deny, denyModal] = useDeny()
  const [sending, setSending] = useState<string | null>(null)
  const [doneEmail, setDoneEmail] = useState<string | null>(null)

  const clients = useMemo(() => {
    const map = new Map<string, Client>()
    for (const b of db.bookings) {
      if (b.status === 'cancelled') continue
      const k = clientKey(b)
      const c = map.get(k) ?? { name: '', phone: '', email: '', lastDate: '', visits: 0 }
      c.visits += 1
      if (b.date > c.lastDate) c.lastDate = b.date
      if (!c.name && b.clientName) c.name = b.clientName
      if (!c.phone && b.clientPhone) c.phone = b.clientPhone
      if (!c.email && b.clientEmail) c.email = b.clientEmail
      map.set(k, c)
    }
    return [...map.values()].sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1))
  }, [db.bookings])

  const inviteRec = (email: string) =>
    email ? db.clientInvites.find((x) => x.email === email.trim().toLowerCase()) : undefined

  const invite = async (c: Client, lang: 'en' | 'ru') => {
    if (!canManage) return deny()
    if (!c.email) return
    setSending(c.email + lang)
    try {
      if (isRemote()) {
        const r = await remote.sendClientInvite(c.email, lang, c.name || undefined)
        if (r.lastAt && r.count) setClientInviteLocal(c.email, r.lastAt, r.count)
        if (!r.ok) {
          if (r.cooldown) alert('Этому клиенту недавно уже отправляли приглашение.')
          return
        }
      } else {
        // Локальный режим (демо) — без письма, только счётчик.
        const prev = inviteRec(c.email)
        setClientInviteLocal(c.email, Date.now(), (prev?.count || 0) + 1)
      }
      setDoneEmail(c.email)
      setTimeout(() => setDoneEmail((e) => (e === c.email ? null : e)), 2500)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось отправить приглашение')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Клиенты</h1>
          <p className="muted small">
            Все, кто записывался. Приглашение вернуться можно отправить тем, кто не был больше {RETURN_DAYS} дней.
          </p>
        </div>
      </header>

      {clients.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="contact" size={44} />
          </div>
          <p>Пока никто не записывался — здесь появятся клиенты.</p>
        </div>
      ) : (
        <div className="client-list">
          {clients.map((c, i) => {
            const sinceVisit = c.lastDate ? daysAgoFromDate(c.lastDate) : Infinity
            const lapsed = sinceVisit > RETURN_DAYS
            const rec = inviteRec(c.email)
            const sinceInvite = rec ? daysAgoFromMs(rec.lastAt) : Infinity
            const cooling = rec ? sinceInvite < COOLDOWN_DAYS : false
            const busy = sending === c.email + 'en' || sending === c.email + 'ru'
            const showInvite = canManage && lapsed
            return (
              <div className="client-row" key={i}>
                <Avatar src={null} name={c.name || c.phone || '?'} size={42} />
                <div className="client-row-main">
                  <div className="client-row-name">{c.name || 'Без имени'}</div>
                  <div className="client-row-sub muted">
                    {c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : 'без телефона'}
                  </div>
                </div>
                <div className="client-row-last">
                  <div className="muted small">Последний визит</div>
                  <b>{c.lastDate ? formatDayMonth(c.lastDate) : '—'}</b>
                </div>

                {showInvite && (
                  <div className="client-invite">
                    {c.email ? (
                      <>
                        <div className="client-invite-btns">
                          <button
                            className="btn btn-sm"
                            disabled={busy || cooling}
                            title="Отправить приглашение на английском"
                            onClick={() => invite(c, 'en')}
                          >
                            {sending === c.email + 'en' ? '…' : 'Пригласить · EN'}
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busy || cooling}
                            title="Отправить приглашение на русском"
                            onClick={() => invite(c, 'ru')}
                          >
                            {sending === c.email + 'ru' ? '…' : 'Пригласить · RU'}
                          </button>
                        </div>
                        <div className="client-invite-meta muted small">
                          {doneEmail === c.email ? (
                            <span className="invite-done">Отправлено ✓</span>
                          ) : rec ? (
                            <>
                              Приглашали {humanAgo(sinceInvite)} · {rec.count}×
                              {cooling && ` · снова через ${COOLDOWN_DAYS - sinceInvite} дн.`}
                            </>
                          ) : (
                            'Ещё не приглашали'
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="client-invite-meta muted small">нет email для приглашения</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {denyModal}
    </div>
  )
}
