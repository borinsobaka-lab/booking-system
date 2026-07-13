import { useState } from 'react'
import { useDB, saveSpecialist, deleteSpecialist, uid } from '../db'
import { Avatar, Field, ImagePicker, Modal, LangTabs, setLoc } from '../ui'
import { pick, specialistName, emptyLoc } from '../localized'
import type { Lang, Specialist } from '../types'

const A: Lang = 'ru' // отображение в админке

export function SpecialistsPage() {
  const db = useDB()
  const [editing, setEditing] = useState<Specialist | null>(null)

  const blank = (): Specialist => ({
    id: uid(),
    firstName: emptyLoc(),
    lastName: emptyLoc(),
    role: { en: 'Massage therapist', ka: 'მასაჟისტი', ru: 'Массажист' },
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
                <Avatar src={sp.avatar} name={specialistName(sp, A)} size={64} />
                <div className="spec-card-name">{specialistName(sp, A)}</div>
                <div className="spec-card-role">{pick(sp.role, A)}</div>
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
                <div className="card-actions">
                  <button className="linkbtn" onClick={() => setEditing(sp)}>
                    Изменить
                  </button>
                  <button
                    className="linkbtn danger"
                    onClick={() => confirm(`Удалить специалиста «${specialistName(sp, A)}»?`) && deleteSpecialist(sp.id)}
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
