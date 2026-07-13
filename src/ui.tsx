// Небольшие переиспользуемые UI-компоненты.

import { useEffect, useRef, type ReactNode } from 'react'
import { LANGS } from './i18n'
import type { Lang, LocalizedString } from './types'

/** Вкладки языков для заполнения контента на EN/KA/RU. */
export function LangTabs({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="lang-tabs">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-tab${value === l.code ? ' active' : ''}`}
          onClick={() => onChange(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** Обновить один язык в LocalizedString. */
export function setLoc(v: LocalizedString, lang: Lang, val: string): LocalizedString {
  return { ...v, [lang]: val }
}

/** Звёзды рейтинга: серые незаполненные, жёлтые по значению value (0..5). */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${value.toFixed(1)} / 5`}>
      <span className="stars-empty">★★★★★</span>
      <span className="stars-full" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  )
}

/** Читает выбранный файл-картинку в data-URL (с даунскейлом до maxSize px). */
export function readImageFile(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(reader.result as string)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(reader.result as string)
      img.src = reader.result as string
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Круглый или прямоугольный загрузчик картинки. */
export function ImagePicker({
  value,
  onChange,
  shape = 'circle',
  label = 'Фото',
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  shape?: 'circle' | 'rect'
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onFile = async (f: File | undefined) => {
    if (!f) return
    onChange(await readImageFile(f, shape === 'circle' ? 400 : 1200))
  }
  return (
    <div className={`imgpick imgpick-${shape}`}>
      <button
        type="button"
        className="imgpick-preview"
        onClick={() => inputRef.current?.click()}
        style={value ? { backgroundImage: `url(${value})` } : undefined}
        title="Загрузить картинку"
      >
        {!value && <span className="imgpick-plus">＋</span>}
      </button>
      <div className="imgpick-actions">
        <button type="button" className="linkbtn" onClick={() => inputRef.current?.click()}>
          {value ? 'Заменить' : label}
        </button>
        {value && (
          <button type="button" className="linkbtn danger" onClick={() => onChange(null)}>
            Удалить
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </div>
  )
}

/** Аватар: картинка или инициалы. */
export function Avatar({
  src,
  name,
  size = 40,
  dim = false,
}: {
  src: string | null
  name: string
  size?: number
  dim?: boolean
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div
      className={`avatar${dim ? ' avatar-dim' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundImage: src ? `url(${src})` : undefined,
      }}
    >
      {!src && <span>{initials || '?'}</span>}
    </div>
  )
}

/** Простая модалка. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

/** Форматирование цены (валюта салона — лари). */
export function money(v: number): string {
  return `${v.toLocaleString('ru-RU')} ₾`
}

/** Длительность в человекочитаемом виде. */
export function duration(min: number): string {
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
