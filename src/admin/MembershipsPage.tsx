// Раздел «Абонементы»: у кого сколько визитов и сколько уже списано.
// Смотреть может любой сотрудник, заводить и править — владелец и администратор.
//
// Абонемент привязан к телефону клиента: записи с этим номером автоматически
// помечаются «по абонементу», отменённые возвращают визит. Сам пересчёт — в
// src/memberships.ts (локальный режим) и в worker/src/logic.js (боевой).

import { useMemo, useState } from 'react'
import { useDB, saveMembershipLocal, deleteMembershipLocal, uid } from '../db'
import { isRemote } from '../config'
import * as remote from '../remote'
import { enterAdmin } from '../session'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import { Avatar, Field, Modal } from '../ui'
import { Icon } from '../icons'
import { PhoneInput } from '../PhoneInput'
import { leftOf, phoneKey } from '../memberships'
import { formatDayMonth, todayKey } from '../time'
import type { Booking, Membership } from '../types'

interface Usage {
  /** Записи вперёд, за которые визит уже отложен. */
  ahead: number
  /** Ближайшая запись по абонементу. */
  nextDate: string | null
}

export function MembershipsPage() {
  const db = useDB()
  const { canManageBookings } = useAuth()
  const [deny, denyModal] = useDeny()
  const [editing, setEditing] = useState<Membership | 'new' | null>(null)
  const [query, setQuery] = useState('')

  const today = todayKey()

  // Что именно списано по каждому абонементу — по привязанным записям.
  const usage = useMemo(() => {
    const map = new Map<string, Usage>()
    for (const b of db.bookings) {
      if (!b.membershipId || b.status === 'cancelled') continue
      if (b.date < today) continue
      const u = map.get(b.membershipId) ?? { ahead: 0, nextDate: null }
      u.ahead += 1
      if (!u.nextDate || b.date < u.nextDate) u.nextDate = b.date
      map.set(b.membershipId, u)
    }
    return map
  }, [db.bookings, today])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return [...(db.memberships ?? [])]
      .filter((m) => {
        if (!q) return true
        if (qDigits && phoneKey(m.clientPhone).includes(qDigits.slice(-9))) return true
        return (m.clientName || '').toLowerCase().includes(q) || m.clientPhone.includes(q)
      })
      // Сначала действующие, внутри — свежие сверху.
      .sort((a, b) => {
        const byLeft = Number(leftOf(b) > 0) - Number(leftOf(a) > 0)
        return byLeft !== 0 ? byLeft : b.createdAt - a.createdAt
      })
  }, [db.memberships, query])

  const remove = async (m: Membership) => {
    if (!canManageBookings) return deny()
    if (!confirm(`Удалить абонемент клиента ${m.clientName || m.clientPhone}?`)) return
    if (isRemote()) {
      try {
        await remote.deleteMembershipRemote(m.id)
        await enterAdmin()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось удалить абонемент')
      }
      return
    }
    deleteMembershipLocal(m.id)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Абонементы</h1>
          <p className="muted small">
            Клиент с абонементом узнаётся по телефону: его записи сами помечаются «по абонементу» и
            списывают визит, а при отмене визит возвращается.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => (canManageBookings ? setEditing('new') : deny())}>
          + Абонемент
        </button>
      </header>

      {(db.memberships ?? []).length > 3 && (
        <input
          className="ms-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени или телефону"
          aria-label="Поиск абонемента"
        />
      )}

      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="ticket" size={44} />
          </div>
          <p>
            {(db.memberships ?? []).length === 0
              ? 'Абонементов пока нет. Заведите первый — и записи клиента начнут списываться с него.'
              : 'Ничего не нашлось.'}
          </p>
        </div>
      ) : (
        <div className="ms-list">
          {list.map((m) => {
            const left = leftOf(m)
            const u = usage.get(m.id) ?? { ahead: 0, nextDate: null }
            const pct = m.total > 0 ? Math.min(100, Math.round((m.used / m.total) * 100)) : 0
            return (
              <div className={`ms-row${left === 0 ? ' spent' : ''}`} key={m.id}>
                <Avatar src={null} name={m.clientName || m.clientPhone} size={42} />
                <div className="ms-main">
                  <div className="ms-name">
                    {m.clientName || 'Без имени'}
                    {left === 0 && <span className="badge">израсходован</span>}
                  </div>
                  <div className="ms-sub muted">
                    <a href={`tel:${m.clientPhone.replace(/\s/g, '')}`}>{m.clientPhone}</a>
                  </div>
                  {m.note && <div className="ms-note muted small">{m.note}</div>}
                </div>

                <div className="ms-count">
                  <div className="ms-left">
                    <b>{left}</b> из {m.total}
                  </div>
                  <div className="ms-bar" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="muted small">
                    Списано {m.used}
                    {u.ahead > 0 && ` · из них впереди ${u.ahead}`}
                  </div>
                  {u.nextDate && <div className="muted small">Ближайший визит: {formatDayMonth(u.nextDate)}</div>}
                </div>

                <div className="ms-actions">
                  <button className="linkbtn" onClick={() => (canManageBookings ? setEditing(m) : deny())}>
                    Изменить
                  </button>
                  <button className="linkbtn danger" onClick={() => remove(m)}>
                    Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <MembershipForm
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {denyModal}
    </div>
  )
}

/** Последнее имя клиента с этим телефоном — подставляем в форму. */
function nameByPhone(bookings: Booking[], phone: string): string {
  const key = phoneKey(phone)
  if (!key) return ''
  const found = [...bookings]
    .filter((b) => b.clientName && phoneKey(b.clientPhone) === key)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  return found?.clientName ?? ''
}

function MembershipForm({ value, onClose }: { value: Membership | null; onClose: () => void }) {
  const db = useDB()
  const [clientName, setClientName] = useState(value?.clientName ?? '')
  const [clientPhone, setClientPhone] = useState(value?.clientPhone ?? '')
  const [total, setTotal] = useState(String(value?.total ?? 10))
  const [note, setNote] = useState(value?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const today = todayKey()
  const count = Math.floor(Number(total))
  const phoneOk = phoneKey(clientPhone) !== ''
  const countOk = count >= 1 && count <= 1000

  // Сколько записей клиента подхватит абонемент — сразу видно, что номер совпал.
  const matching = useMemo(() => {
    const key = phoneKey(clientPhone)
    if (!key) return { ahead: 0, total: 0 }
    const mine = db.bookings.filter((b) => b.status !== 'cancelled' && phoneKey(b.clientPhone) === key)
    return { ahead: mine.filter((b) => b.date >= today).length, total: mine.length }
  }, [db.bookings, clientPhone, today])

  const onPhone = (v: string) => {
    setClientPhone(v)
    // Клиент уже записывался — подставим его имя, если поле пустое.
    if (!clientName.trim()) {
      const found = nameByPhone(db.bookings, v)
      if (found) setClientName(found)
    }
  }

  const save = async () => {
    if (!phoneOk || !countOk || busy) return
    setBusy(true)
    setError('')
    const payload = {
      id: value?.id,
      clientName: clientName.trim() || undefined,
      clientPhone: clientPhone.trim(),
      total: count,
      note: note.trim() || undefined,
    }
    try {
      if (isRemote()) {
        await remote.saveMembershipRemote(payload)
        await enterAdmin()
      } else {
        saveMembershipLocal({
          id: value?.id ?? uid(),
          clientName: payload.clientName,
          clientPhone: payload.clientPhone,
          total: count,
          used: value?.used ?? 0,
          note: payload.note,
          startDate: value?.startDate ?? today,
          createdAt: value?.createdAt ?? Date.now(),
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить абонемент')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={value ? 'Абонемент' : 'Новый абонемент'} onClose={onClose}>
      <div className="form">
        <Field label="Имя клиента (необязательно)">
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Например, Ана" />
        </Field>
        <div className="field">
          <label className="field-label" htmlFor="ms-phone">
            Телефон клиента *
          </label>
          <PhoneInput id="ms-phone" lang="ru" value={clientPhone} onChange={onPhone} />
          <span className="field-hint muted small">
            По этому номеру записи клиента и будут узнаваться.
            {matching.total > 0 &&
              ` Сейчас у него ${matching.total} записей, из них впереди — ${matching.ahead}.`}
          </span>
        </div>
        <Field label="Количество посещений *">
          <input
            type="number"
            min={1}
            max={1000}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </Field>
        <Field label="Заметка (необязательно)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, оплачен наличными" />
        </Field>

        {value && (
          <p className="muted small">
            Списано визитов: {value.used} из {value.total}. Действует с {formatDayMonth(value.startDate)}.
          </p>
        )}
        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={!phoneOk || !countOk || busy} onClick={save}>
            {busy ? '…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
