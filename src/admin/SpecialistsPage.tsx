import { useState } from 'react'
import { useDB, saveSpecialist, deleteSpecialist, uid } from '../db'
import { Avatar, Field, ImagePicker, Modal } from '../ui'
import type { Specialist } from '../types'

export function SpecialistsPage() {
  const db = useDB()
  const [editing, setEditing] = useState<Specialist | null>(null)

  const blank = (): Specialist => ({
    id: uid(),
    firstName: '',
    lastName: '',
    role: 'Массажист',
    avatar: null,
    serviceIds: [],
    createdAt: Date.now(),
  })

  return (
    <div className="page">
      <header className="page-head">
        <h1>Специалисты</h1>
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          + Добавить специалиста
        </button>
      </header>

      {db.specialists.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🧑‍⚕️</div>
          <p>Добавьте специалистов — их можно ставить в расписание и записывать к ним клиентов.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {db.specialists.map((sp) => {
            const services = db.services.filter((s) => sp.serviceIds.includes(s.id))
            return (
              <div className="spec-card" key={sp.id}>
                <Avatar src={sp.avatar} name={`${sp.firstName} ${sp.lastName}`} size={64} />
                <div className="spec-card-name">
                  {sp.firstName} {sp.lastName}
                </div>
                <div className="spec-card-role">{sp.role}</div>
                <div className="spec-card-services">
                  {services.length ? (
                    services.map((s) => (
                      <span className="chip" key={s.id}>
                        {s.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted small">Услуги не выбраны</span>
                  )}
                </div>
                <div className="card-actions">
                  <button className="linkbtn" onClick={() => setEditing(sp)}>
                    Изменить
                  </button>
                  <button
                    className="linkbtn danger"
                    onClick={() =>
                      confirm(`Удалить специалиста «${sp.firstName} ${sp.lastName}»?`) && deleteSpecialist(sp.id)
                    }
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <SpecialistEditor specialist={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SpecialistEditor({ specialist, onClose }: { specialist: Specialist; onClose: () => void }) {
  const db = useDB()
  const [sp, setSp] = useState<Specialist>(specialist)
  const set = <K extends keyof Specialist>(k: K, v: Specialist[K]) => setSp((p) => ({ ...p, [k]: v }))

  const toggleService = (id: string) =>
    setSp((p) => ({
      ...p,
      serviceIds: p.serviceIds.includes(id) ? p.serviceIds.filter((x) => x !== id) : [...p.serviceIds, id],
    }))

  const save = () => {
    if (!sp.firstName.trim() && !sp.lastName.trim()) return alert('Укажите имя специалиста')
    saveSpecialist({ ...sp, firstName: sp.firstName.trim(), lastName: sp.lastName.trim() })
    onClose()
  }

  return (
    <Modal title={specialist.firstName || specialist.lastName ? 'Специалист' : 'Новый специалист'} onClose={onClose}>
      <div className="form">
        <div className="form-imgrow">
          <ImagePicker value={sp.avatar} onChange={(v) => set('avatar', v)} shape="circle" label="Аватарка" />
        </div>
        <div className="form-row">
          <Field label="Имя">
            <input value={sp.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Фамилия">
            <input value={sp.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
        </div>
        <Field label="Роль / специализация">
          <input value={sp.role} onChange={(e) => set('role', e.target.value)} placeholder="Например, Массажист" />
        </Field>
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
                  <span>{s.name}</span>
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
