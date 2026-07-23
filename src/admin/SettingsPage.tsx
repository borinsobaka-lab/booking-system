import { useState } from 'react'
import { useDB, updateBrand, updateSettings } from '../db'
import { Field, ImagePicker, LangTabs, setLoc } from '../ui'
import type { Lang } from '../types'

// Пресеты минимального запаса до записи (в минутах). 0 — без ограничения.
const LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Без ограничения' },
  { value: 30, label: 'За 30 минут' },
  { value: 60, label: 'За 1 час' },
  { value: 120, label: 'За 2 часа' },
  { value: 180, label: 'За 3 часа' },
  { value: 360, label: 'За 6 часов' },
  { value: 720, label: 'За 12 часов' },
  { value: 1440, label: 'За 1 день' },
]

/** Настройки бренда — то, что клиент видит на витрине записи. */
export function SettingsPage() {
  const db = useDB()
  const [lang, setLang] = useState<Lang>('en')
  const [name, setName] = useState(db.brand.name)
  const [address, setAddress] = useState(db.brand.address)
  const [saved, setSaved] = useState(false)

  const flash = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Бренд</h1>
      </header>
      <div className="settings-card">
        <p className="muted">Аватар, название и адрес показываются клиентам на странице записи.</p>

        <div className="settings-row">
          <div>
            <span className="field-label">Аватар бренда</span>
            <ImagePicker
              value={db.brand.avatar}
              onChange={(v) => {
                updateBrand({ avatar: v })
                flash()
              }}
              shape="circle"
              label="Логотип"
            />
          </div>
          <div className="settings-banner">
            <span className="field-label">Баннер (шапка)</span>
            <ImagePicker
              value={db.brand.banner}
              onChange={(v) => {
                updateBrand({ banner: v })
                flash()
              }}
              shape="rect"
              label="Баннер"
            />
          </div>
        </div>

        <p className="muted small">Название и адрес заполняются на каждом языке.</p>
        <LangTabs value={lang} onChange={setLang} />
        <Field label="Название бренда">
          <input
            value={name[lang]}
            onChange={(e) => setName(setLoc(name, lang, e.target.value))}
            onBlur={() => {
              updateBrand({ name })
              flash()
            }}
          />
        </Field>
        <Field label="Адрес">
          <input
            value={address[lang]}
            onChange={(e) => setAddress(setLoc(address, lang, e.target.value))}
            onBlur={() => {
              updateBrand({ address })
              flash()
            }}
          />
        </Field>

        <p className="muted small">Контакты студии — показываются клиентам и подставляются в письма.</p>
        <div className="form-row">
          <Field label="Телефон">
            <input
              type="tel"
              value={db.settings.phone ?? ''}
              onChange={(e) => updateSettings({ phone: e.target.value })}
              onBlur={flash}
              placeholder="+995 555 12 34 56"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              type="tel"
              value={db.settings.whatsapp ?? ''}
              onChange={(e) => updateSettings({ whatsapp: e.target.value })}
              onBlur={flash}
              placeholder="+995 555 12 34 56"
            />
          </Field>
        </div>

        {saved && <div className="saved-hint">Сохранено ✓</div>}
      </div>

      <header className="page-head">
        <h1>Запись</h1>
      </header>
      <div className="settings-card">
        <p className="muted">Правила онлайн-записи для клиентов на витрине.</p>
        <Field label="Минимальный запас до начала сеанса">
          <select
            value={db.settings.minLeadMinutes}
            onChange={(e) => {
              updateSettings({ minLeadMinutes: Number(e.target.value) })
              flash()
            }}
          >
            {LEAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted small">
          Клиент не сможет записаться, если до начала сеанса осталось меньше этого времени
          (например, чтобы не бронировали визит «через 10 минут»). У администратора ограничения нет.
        </p>
      </div>

      <header className="page-head">
        <h1>Выплаты массажисту</h1>
      </header>
      <div className="settings-card">
        <p className="muted">Сколько переводить массажисту за один проведённый сеанс. Используется в разделе «Записи» → «Прошедшие» для подсчёта суммы к переводу.</p>
        <Field label="Выплата за сеанс, ₾">
          <input
            type="number"
            min={0}
            step={5}
            value={db.settings.payoutPerSession ?? 40}
            onChange={(e) => updateSettings({ payoutPerSession: Math.max(0, Number(e.target.value) || 0) })}
            onBlur={flash}
          />
        </Field>
      </div>
    </div>
  )
}
