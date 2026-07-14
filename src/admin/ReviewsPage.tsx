import { useState } from 'react'
import { useDB, saveReview, deleteReview, uid } from '../db'
import { Avatar, Field, ImagePicker, Modal, Stars } from '../ui'
import { specialistName } from '../localized'
import { Icon } from '../icons'
import { todayKey, formatFull } from '../time'
import type { Lang, Review } from '../types'

const A: Lang = 'ru'

export function ReviewsPage() {
  const db = useDB()
  const [editing, setEditing] = useState<Review | null>(null)

  const blank = (): Review => ({
    id: uid(),
    specialistId: db.specialists[0]?.id ?? '',
    authorName: '',
    rating: 5,
    text: '',
    date: todayKey(),
    avatar: null,
    createdAt: Date.now(),
  })

  const sorted = [...db.reviews].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Отзывы</h1>
          <p className="muted small">Созданные здесь отзывы сразу видны у мастера на витрине.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(blank())} disabled={db.specialists.length === 0}>
          + Добавить отзыв
        </button>
      </header>

      {db.specialists.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji"><Icon name="message" size={44} /></div>
          <p>Сначала добавьте специалистов — отзывы привязываются к мастеру.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji"><Icon name="message" size={44} /></div>
          <p>Пока нет отзывов. Добавьте первый — он появится в карточке мастера.</p>
        </div>
      ) : (
        <div className="review-list">
          {sorted.map((r) => {
            const sp = db.specialists.find((s) => s.id === r.specialistId)
            return (
              <div className="review-row" key={r.id}>
                <Avatar src={r.avatar} name={r.authorName} size={44} />
                <div className="review-row-main">
                  <div className="review-row-head">
                    <b>{r.authorName || 'Без имени'}</b>
                    <Stars value={r.rating} size={14} />
                  </div>
                  <div className="muted small">
                    {sp ? specialistName(sp, A) : '—'} · {formatFull(r.date)}
                  </div>
                  {r.text && <div className="review-row-text">{r.text}</div>}
                </div>
                <div className="review-row-actions">
                  <button className="linkbtn" onClick={() => setEditing(r)}>
                    Изменить
                  </button>
                  <button className="linkbtn danger" onClick={() => confirm('Удалить отзыв?') && deleteReview(r.id)}>
                    Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && <ReviewEditor review={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ReviewEditor({ review, onClose }: { review: Review; onClose: () => void }) {
  const db = useDB()
  const [r, setR] = useState<Review>(review)
  const set = <K extends keyof Review>(k: K, v: Review[K]) => setR((p) => ({ ...p, [k]: v }))

  const save = () => {
    if (!r.specialistId) return alert('Выберите мастера')
    if (!r.authorName.trim()) return alert('Укажите имя автора')
    saveReview({ ...r, authorName: r.authorName.trim(), text: r.text.trim() })
    onClose()
  }

  return (
    <Modal title={review.authorName ? 'Отзыв' : 'Новый отзыв'} onClose={onClose}>
      <div className="form">
        <div className="form-imgrow">
          <ImagePicker value={r.avatar} onChange={(v) => set('avatar', v)} shape="circle" label="Аватар автора" />
        </div>
        <Field label="Мастер">
          <select value={r.specialistId} onChange={(e) => set('specialistId', e.target.value)}>
            {db.specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {specialistName(s, A)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Имя автора">
          <input value={r.authorName} onChange={(e) => set('authorName', e.target.value)} placeholder="Например, Анна" />
        </Field>
        <div className="field">
          <span className="field-label">Оценка</span>
          <StarPicker value={r.rating} onChange={(v) => set('rating', v)} />
        </div>
        <Field label="Дата">
          <input type="date" value={r.date} onChange={(e) => set('date', e.target.value || todayKey())} />
        </Field>
        <Field label="Текст отзыва">
          <textarea value={r.text} onChange={(e) => set('text', e.target.value)} rows={4} placeholder="Что понравилось…" />
        </Field>
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

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-pick${n <= value ? ' on' : ''}`}
          onClick={() => onChange(n)}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
