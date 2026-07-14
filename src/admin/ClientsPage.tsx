import { useMemo } from 'react'
import { useDB } from '../db'
import { Avatar } from '../ui'
import { Icon } from '../icons'
import { formatDayMonth } from '../time'
import type { Booking } from '../types'

// Ключ клиента: телефон → email → имя (как в разделе «Записи»).
function clientKey(b: Booking): string {
  const phone = (b.clientPhone || '').replace(/[^\d]/g, '')
  if (phone) return 'p:' + phone
  if (b.clientEmail) return 'e:' + b.clientEmail.trim().toLowerCase()
  return 'n:' + (b.clientName || '').trim().toLowerCase()
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Клиенты</h1>
          <p className="muted small">Все, кто записывался. Обновляется автоматически из записей.</p>
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
          {clients.map((c, i) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
