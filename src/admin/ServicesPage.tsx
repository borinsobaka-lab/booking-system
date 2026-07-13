import { useState } from 'react'
import { useDB, saveService, deleteService, uid } from '../db'
import { Field, ImagePicker, Modal, money, duration } from '../ui'
import type { Service } from '../types'

export function ServicesPage() {
  const db = useDB()
  const [editing, setEditing] = useState<Service | null>(null)

  const blank = (): Service => ({
    id: uid(),
    name: '',
    description: '',
    durationMin: 60,
    price: 0,
    image: null,
    createdAt: Date.now(),
  })

  return (
    <div className="page">
      <header className="page-head">
        <h1>Услуги</h1>
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          + Добавить услугу
        </button>
      </header>

      {db.services.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">💆</div>
          <p>Пока нет ни одной услуги. Добавьте первую — она появится у клиентов.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {db.services.map((s) => (
            <div className="svc-card" key={s.id}>
              <div
                className="svc-card-img"
                style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}
              >
                {!s.image && <span>💆</span>}
              </div>
              <div className="svc-card-body">
                <div className="svc-card-title">{s.name || 'Без названия'}</div>
                {s.description && <div className="svc-card-desc">{s.description}</div>}
                <div className="svc-card-meta">
                  <span>⏱ {duration(s.durationMin)}</span>
                  <span className="svc-card-price">{money(s.price)}</span>
                </div>
              </div>
              <div className="card-actions">
                <button className="linkbtn" onClick={() => setEditing(s)}>
                  Изменить
                </button>
                <button
                  className="linkbtn danger"
                  onClick={() => confirm(`Удалить услугу «${s.name}»?`) && deleteService(s.id)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ServiceEditor service={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ServiceEditor({ service, onClose }: { service: Service; onClose: () => void }) {
  const [s, setS] = useState<Service>(service)
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS((prev) => ({ ...prev, [k]: v }))

  const save = () => {
    if (!s.name.trim()) return alert('Укажите название услуги')
    saveService({ ...s, name: s.name.trim() })
    onClose()
  }

  return (
    <Modal title={service.name ? 'Услуга' : 'Новая услуга'} onClose={onClose}>
      <div className="form">
        <div className="form-imgrow">
          <ImagePicker value={s.image} onChange={(v) => set('image', v)} shape="rect" label="Картинка услуги" />
        </div>
        <Field label="Название">
          <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Например, Классический массаж" />
        </Field>
        <Field label="Описание">
          <textarea
            value={s.description}
            onChange={(e) => set('description', e.target.value)}
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
          <Field label="Стоимость, ₽">
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
