import { useEffect, useRef, useState } from 'react'
import { useDB, saveService, deleteService, reorderServices, uid } from '../db'
import { Field, ImagePicker, Modal, money, duration, LangTabs, setLoc } from '../ui'
import { pick } from '../localized'
import { emptyLoc } from '../localized'
import { Icon } from '../icons'
import { useAuth } from '../auth'
import { useDeny } from './guard'
import type { Lang, Service } from '../types'

// В админке контент показываем на русском (с фолбэком).
const A: Lang = 'ru'

export function ServicesPage() {
  const db = useDB()
  const { canManage } = useAuth()
  const [deny, denyModal] = useDeny()
  const [editing, setEditing] = useState<Service | null>(null)
  const guard = (fn: () => void) => () => (canManage ? fn() : deny())

  // Локальный порядок для плавного перетаскивания. Синхронизируем с БД, пока
  // не тащим карточку (иначе перерисовка сбивала бы drag).
  const [order, setOrder] = useState<Service[]>(db.services)
  const [dragId, setDragId] = useState<string | null>(null)
  const draggingRef = useRef(false)
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    if (!draggingRef.current) setOrder(db.services)
  }, [db.services])

  // Слушаем pointermove/up на window: карточка при перестановке двигается в DOM,
  // и capture на самой ручке терялся бы — window же ловит события всегда.
  useEffect(() => {
    if (!dragId) return
    const move = (e: PointerEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.svc-card')
      const overId = el?.getAttribute('data-id')
      if (!overId || overId === dragId) return
      setOrder((prev) => {
        const from = prev.findIndex((x) => x.id === dragId)
        const to = prev.findIndex((x) => x.id === overId)
        if (from < 0 || to < 0 || from === to) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }
    const up = () => {
      draggingRef.current = false
      const ids = orderRef.current.map((s) => s.id)
      if (ids.join() !== db.services.map((s) => s.id).join()) reorderServices(ids)
      setDragId(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  const blank = (): Service => ({
    id: uid(),
    name: emptyLoc(),
    description: emptyLoc(),
    durationMin: 60,
    price: 0,
    image: null,
    createdAt: Date.now(),
  })

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (!canManage) return deny()
    e.preventDefault()
    draggingRef.current = true
    setDragId(id)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Услуги</h1>
        <button className="btn btn-primary" onClick={guard(() => setEditing(blank()))}>
          + Услуга
        </button>
      </header>

      {order.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji"><Icon name="sparkles" size={44} /></div>
          <p>Пока нет ни одной услуги. Добавьте первую — она появится у клиентов.</p>
        </div>
      ) : (
        <>
          {canManage && order.length > 1 && (
            <p className="muted small reorder-hint">Перетаскивайте карточки за уголок ⠿, чтобы задать порядок услуг — в таком же порядке они видны клиентам.</p>
          )}
          <div className="cards-grid">
            {order.map((s) => (
              <div className={`svc-card${dragId === s.id ? ' dragging' : ''}`} key={s.id} data-id={s.id}>
                {canManage && (
                  <button
                    className="drag-handle"
                    title="Перетащить"
                    aria-label="Перетащить для смены порядка"
                    onPointerDown={(e) => startDrag(e, s.id)}
                  >
                    ⠿
                  </button>
                )}
                <div
                  className="svc-card-img"
                  style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}
                >
                  {!s.image && <span>💆</span>}
                </div>
                <div className="svc-card-body">
                  <div className="svc-card-title">{pick(s.name, A) || 'Без названия'}</div>
                  {pick(s.description, A) && <div className="svc-card-desc">{pick(s.description, A)}</div>}
                  <div className="svc-card-meta">
                    <span>⏱ {duration(s.durationMin)}</span>
                    <span className="svc-card-price">{money(s.price)}</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button className="linkbtn" onClick={guard(() => setEditing(s))}>
                    Изменить
                  </button>
                  <button
                    className="linkbtn danger"
                    onClick={guard(() => confirm(`Удалить услугу «${pick(s.name, A)}»?`) && deleteService(s.id))}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && <ServiceEditor service={editing} onClose={() => setEditing(null)} />}
      {denyModal}
    </div>
  )
}

function ServiceEditor({ service, onClose }: { service: Service; onClose: () => void }) {
  const [s, setS] = useState<Service>(service)
  const [lang, setLang] = useState<Lang>('en')
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS((prev) => ({ ...prev, [k]: v }))

  const save = () => {
    // Название должно быть заполнено хотя бы на одном языке.
    if (!s.name.en.trim() && !s.name.ka.trim() && !s.name.ru.trim()) return alert('Укажите название услуги')
    saveService(s)
    onClose()
  }

  const hasName = service.name.en || service.name.ka || service.name.ru
  return (
    <Modal title={hasName ? 'Услуга' : 'Новая услуга'} onClose={onClose}>
      <div className="form">
        <div className="form-imgrow">
          <ImagePicker value={s.image} onChange={(v) => set('image', v)} shape="rect" label="Картинка услуги" />
        </div>
        <p className="muted small">Заполните текст на каждом языке — переключайте вкладки.</p>
        <LangTabs value={lang} onChange={setLang} />
        <Field label="Название">
          <input
            value={s.name[lang]}
            onChange={(e) => set('name', setLoc(s.name, lang, e.target.value))}
            placeholder="Например, Классический массаж"
          />
        </Field>
        <Field label="Описание">
          <textarea
            value={s.description[lang]}
            onChange={(e) => set('description', setLoc(s.description, lang, e.target.value))}
            rows={3}
            placeholder="Коротко о том, что входит в услугу"
          />
        </Field>
        <div className="form-row">
          <Field label="Длительность, мин">
            <input
              type="number"
              min={15}
              step={15}
              value={s.durationMin}
              onChange={(e) => set('durationMin', Math.max(15, Number(e.target.value) || 0))}
            />
          </Field>
          <Field label="Стоимость, ₾">
            <input
              type="number"
              min={0}
              step={100}
              value={s.price}
              onChange={(e) => set('price', Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
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
