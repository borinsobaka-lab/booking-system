import { useState } from 'react'
import { useDB, updateBrand } from '../db'
import { Field, ImagePicker, LangTabs, setLoc } from '../ui'
import type { Lang } from '../types'

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

        {saved && <div className="saved-hint">Сохранено ✓</div>}
      </div>
    </div>
  )
}
