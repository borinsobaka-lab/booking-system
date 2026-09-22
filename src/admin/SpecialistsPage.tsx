import { useMemo, useState } from 'react'
import { useDB, saveSpecialist, deleteSpecialist, reorderSpecialists, uid } from '../db'
import { Avatar, Field, ImagePicker, Modal, LangTabs, setLoc } from '../ui'
import { RichTextEditor } from '../RichText'
import { pick, specialistName, emptyLoc } from '../localized'
import { DEFAULT_PAYOUT } from '../payout'
import { Icon } from '../icons'
import { useAuth } from '../auth'
import { todayKey } from '../time'
import { useDeny } from './guard'
import { useDragOrder } from './dragOrder'
import type { Lang, Specialist } from '../types'

const A: Lang = 'ru' // отображение в админке

export function SpecialistsPage() {
  const db = useDB()
  const { canManage } = useAuth()
  const [deny, denyModal] = useDeny()
  const guard = (fn: () => void) => () => (canManage ? fn() : deny())
  const [editing, setEditing] = useState<Specialist | null>(null)

  // Деактивированные — последними: видно, кто сейчас работает. Порядок внутри
  // групп задаётся перетаскиванием и совпадает с порядком на витрине.
  const sorted = useMemo(
    () => [...db.specialists.filter((sp) => !sp.inactive), ...db.specialists.filter((sp) => sp.inactive)],
    [db.specialists],
  )
  const { order, dragId, startDrag } = useDragOrder(
    sorted,
    '.spec-card',
    reorderSpecialists,
    (a, b) => !a.inactive === !b.inactive, // активный не уезжает к деактивированным
  )

  const blank = (): Specialist => ({
    id: uid(),
    firstName: emptyLoc(),
    lastName: emptyLoc(),
    role: { en: 'Massage therapist', ka: 'მასაჟისტი', ru: 'Массажист' },
    bio: emptyLoc(),
    avatar: null,
    serviceIds: [],
    createdAt: Date.now(),
  })

  // Деактивация не удаляет ничего: расписание, записи, отзывы и выплаты
  // остаются, просто к мастеру больше нельзя записаться.
  const toggleActive = (sp: Specialist) => {
    if (sp.inactive) return saveSpecialist({ ...sp, inactive: undefined })
    const today = todayKey()
    const upcoming = db.bookings.filter(
      (b) => b.specialistId === sp.id && b.status !== 'cancelled' && b.date >= today,
    ).length
    const tail = upcoming
      ? `\n\nУ него остаются ${upcoming} предстоящих записей — они не отменяются автоматически, при необходимости отмените их в разделе «Записи».`
      : ''
    if (confirm(`Деактивировать специалиста «${specialistName(sp, A)}»? Записаться к нему будет нельзя.${tail}`))
      saveSpecialist({ ...sp, inactive: true })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Специалисты</h1>
        <button className="btn btn-primary" onClick={guard(() => setEditing(blank()))}>
          + Специалист
        </button>
      </header>

      {order.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji"><Icon name="users" size={44} /></div>
          <p>Добавьте специалистов — их можно ставить в расписание и записывать к ним клиентов.</p>
        </div>
      ) : (
        <>
          {canManage && order.length > 1 && (
            <p className="muted small reorder-hint">Перетаскивайте карточки за уголок ⠿, чтобы задать порядок мастеров — в таком же порядке они видны клиентам.</p>
          )}
          <div className="cards-grid">
            {order.map((sp) => {
              const services = db.services.filter((s) => sp.serviceIds.includes(s.id))
              return (
                <div
                  className={`spec-card${sp.inactive ? ' inactive' : ''}${dragId === sp.id ? ' dragging' : ''}`}
                  key={sp.id}
                  data-id={sp.id}
                >
                  {canManage && (
                    <button
                      className="drag-handle"
                      title="Перетащить"
                      aria-label="Перетащить для смены порядка"
                      onPointerDown={(e) => startDrag(e, sp.id)}
                    >
                      ⠿
                    </button>
                  )}
                  <Avatar src={sp.avatar} name={specialistName(sp, A)} size={64} dim={sp.inactive} />
                  <div className="spec-card-name">{specialistName(sp, A)}</div>
                  <div className="spec-card-role">{pick(sp.role, A)}</div>
                  {sp.inactive && <div className="spec-card-badge">Не работает — запись закрыта</div>}
                  <div className="spec-card-services">
                    {services.length ? (
                      services.map((s) => (
                        <span className="chip" key={s.id}>
                          {pick(s.name, A)}
                        </span>
                      ))
                    ) : (
                      <span className="muted small">Услуги не выбраны</span>
                    )}
                  </div>
                  <button className="btn btn-sm spec-card-toggle" onClick={guard(() => toggleActive(sp))}>
                    {sp.inactive ? 'Активировать' : 'Деактивировать'}
                  </button>
                  <div className="card-actions">
                    <button className="linkbtn" onClick={guard(() => setEditing(sp))}>
                      Изменить
                    </button>
                    <button
                      className="linkbtn danger"
                      onClick={guard(() => {
                        // Вместе со специалистом уходят его расписание, записи и
                        // отзывы — предупреждаем, сколько записей будет потеряно.
                        const bookings = db.bookings.filter((b) => b.specialistId === sp.id).length
                        const tail = bookings
                          ? `\n\nВместе с ним удалятся его расписание, отзывы и ${bookings} записей (включая историю выплат). Это не отменить.`
                          : '\n\nВместе с ним удалятся его расписание и отзывы.'
                        if (confirm(`Удалить специалиста «${specialistName(sp, A)}»?${tail}`)) deleteSpecialist(sp.id)
                      })}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {editing && <SpecialistEditor specialist={editing} onClose={() => setEditing(null)} />}
      {denyModal}
    </div>
  )
}

function SpecialistEditor({ specialist, onClose }: { specialist: Specialist; onClose: () => void }) {
  const db = useDB()
  const [sp, setSp] = useState<Specialist>(specialist)
  const [lang, setLang] = useState<Lang>('en')
  const set = <K extends keyof Specialist>(k: K, v: Specialist[K]) => setSp((p) => ({ ...p, [k]: v }))

  const toggleService = (id: string) =>
    setSp((p) => ({
      ...p,
      serviceIds: p.serviceIds.includes(id) ? p.serviceIds.filter((x) => x !== id) : [...p.serviceIds, id],
    }))

  const nameFilled = (l: Specialist['firstName']) => l.en || l.ka || l.ru
  const save = () => {
    if (!nameFilled(sp.firstName) && !nameFilled(sp.lastName)) return alert('Укажите имя специалиста')
    saveSpecialist(sp)
    onClose()
  }

  const existing = nameFilled(specialist.firstName) || nameFilled(specialist.lastName)
  return (
    <Modal title={existing ? 'Специалист' : 'Новый специалист'} onClose={onClose}>
      <div className="form">
        <div className="form-imgrow">
          <ImagePicker value={sp.avatar} onChange={(v) => set('avatar', v)} shape="circle" label="Аватарка" />
        </div>
        <p className="muted small">Заполните текст на каждом языке — переключайте вкладки.</p>
        <LangTabs value={lang} onChange={setLang} />
        <div className="form-row">
          <Field label="Имя">
            <input value={sp.firstName[lang]} onChange={(e) => set('firstName', setLoc(sp.firstName, lang, e.target.value))} />
          </Field>
          <Field label="Фамилия">
            <input value={sp.lastName[lang]} onChange={(e) => set('lastName', setLoc(sp.lastName, lang, e.target.value))} />
          </Field>
        </div>
        <Field label="Роль / специализация">
          <input
            value={sp.role[lang]}
            onChange={(e) => set('role', setLoc(sp.role, lang, e.target.value))}
            placeholder="Например, Массажист"
          />
        </Field>
        <div className="field">
          <span className="field-label">Биография (показывается клиенту в карточке)</span>
          <RichTextEditor
            key={lang}
            value={sp.bio[lang]}
            onChange={(html) => set('bio', setLoc(sp.bio, lang, html))}
            placeholder="Опыт, образование, подход к работе…"
          />
        </div>
        <Field label="Выплата за сеанс, ₾ (необязательно)">
          <input
            type="number"
            min={0}
            step={5}
            value={sp.payoutPerSession ?? ''}
            placeholder={`по умолчанию ${db.settings.payoutPerSession ?? DEFAULT_PAYOUT}`}
            onChange={(e) => {
              const v = e.target.value.trim()
              set('payoutPerSession', v === '' ? undefined : Math.max(0, Number(v) || 0))
            }}
          />
        </Field>
        <p className="muted small">
          Своя ставка этого мастера. Пусто ⇒ берётся общая из раздела «Бренд» → «Выплаты массажисту».
        </p>
        <div className="field">
          <span className="field-label">Выполняемые услуги</span>
          {db.services.length === 0 ? (
            <div className="muted small">Сначала добавьте услуги в разделе «Услуги».</div>
          ) : (
            <div className="check-list">
              {db.services.map((s) => (
                <label className="check-item" key={s.id}>
                  <input
                    type="checkbox"
                    checked={sp.serviceIds.includes(s.id)}
                    onChange={() => toggleService(s.id)}
                  />
                  <span>{pick(s.name, A)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={save}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
