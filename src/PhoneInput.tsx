// Поле телефона: слева — круглый флаг с кодом страны (по умолчанию Грузия),
// справа — номер, который набирается по маске выбранной страны.
// По клику на флаг открывается список стран с поиском.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Flag } from './flags'
import { useI18n } from './i18n'
import {
  countryByCode,
  countryMatches,
  countryOptions,
  digitsOf,
  formatNational,
  fullPhone,
  maskPlaceholder,
  maxNational,
  parsePhone,
} from './phone'

/** Высота выпадающего списка (см. .phone-drop в styles.css). */
const DROP_HEIGHT = 340

export function PhoneInput({
  id,
  value,
  onChange,
}: {
  id?: string
  /** Номер целиком, как он уходит в запись: «+995 555 12 34 56». */
  value: string
  onChange: (value: string) => void
}) {
  const { lang, t } = useI18n()
  // Страна и цифры живут здесь: из строки их каждый раз не вычислить — у разных
  // стран бывает один код (+1 у США и Канады), и выбор пользователя важнее.
  const [phone, setPhone] = useState(() => parsePhone(value))
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const country = countryByCode(phone.code)
  const options = useMemo(() => countryOptions(lang), [lang])
  const shown = useMemo(() => options.filter((o) => countryMatches(o, query)), [options, query])

  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const apply = (code: string, national: string) => {
    setPhone({ code, national })
    onChange(fullPhone(countryByCode(code), national))
  }

  // Закрываем список по клику мимо и по Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Открыли — курсор в поиск. На телефоне не фокусируем: экранная клавиатура
  // закрыла бы сам список, а до поиска всегда можно дотянуться пальцем.
  useEffect(() => {
    if (!open) return
    if (window.matchMedia?.('(pointer: fine)').matches) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.country.code === phone.code)))
    // Внизу экрана места может не быть — тогда раскрываемся вверх.
    const box = boxRef.current?.getBoundingClientRect()
    const below = box ? window.innerHeight - box.bottom : Number.POSITIVE_INFINITY
    setUp(below < DROP_HEIGHT && box !== undefined && box.top > below)
    setOpen(true)
  }

  const select = (code: string) => {
    const next = countryByCode(code)
    apply(code, phone.national.slice(0, maxNational(next)))
    setOpen(false)
    // Сразу возвращаем курсор в номер — человек выбрал страну, чтобы набирать.
    requestAnimationFrame(() => numberRef.current?.focus())
  }

  const onNumber = (raw: string) => {
    // Вставили номер целиком с «плюсом» — сами определим страну.
    if (raw.trim().startsWith('+')) {
      const parsed = parsePhone(raw)
      apply(parsed.code, parsed.national.slice(0, maxNational(countryByCode(parsed.code))))
      return
    }
    apply(phone.code, digitsOf(raw).slice(0, maxNational(country)))
  }

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = shown[active]
      if (opt) select(opt.country.code)
    }
  }

  return (
    <div className={`phone-field${open ? ' open' : ''}`} ref={boxRef}>
      <div className="phone-row">
        <button
          type="button"
          className="phone-country"
          ref={btnRef}
          onClick={() => (open ? setOpen(false) : openList())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('form.countryPick')}
        >
          <Flag code={country.code} size={22} />
          <span className="phone-dial">{country.dial}</span>
          <span className="phone-caret" aria-hidden="true">
            <svg viewBox="0 0 10 6" width="10" height="6" focusable="false">
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <input
          id={id}
          ref={numberRef}
          className="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={formatNational(phone.national, country.mask)}
          placeholder={maskPlaceholder(country.mask)}
          onChange={(e) => onNumber(e.target.value)}
        />
      </div>

      {open && (
        <div className={`phone-drop${up ? ' up' : ''}`}>
          <div className="phone-search">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onSearchKey}
              placeholder={t('form.countrySearch')}
              aria-label={t('form.countrySearch')}
            />
          </div>
          <div className="phone-list" ref={listRef} role="listbox" aria-label={t('form.countryPick')}>
            {shown.map((o, i) => (
              <button
                key={o.country.code}
                type="button"
                role="option"
                data-i={i}
                aria-selected={o.country.code === country.code}
                className={`phone-opt${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(o.country.code)}
              >
                <Flag code={o.country.code} size={22} />
                <span className="phone-opt-name">{o.label}</span>
                <span className="phone-opt-dial">{o.country.dial}</span>
              </button>
            ))}
            {shown.length === 0 && <div className="phone-empty muted">{t('form.countryNone')}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
