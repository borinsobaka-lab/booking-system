// Телефон в форме записи: маска номера, разбор сохранённого значения и список
// стран для выпадающего выбора.
//
// В базу и письма номер уходит в человекочитаемом международном виде —
// «+995 555 12 34 56»: так его удобно читать в админке и звонить по ссылке tel:.

import { COUNTRIES, DEFAULT_COUNTRY, MIN_NATIONAL, type Country } from './countries'
import { localeFor } from './i18n'
import type { Lang } from './types'

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

export { DEFAULT_COUNTRY }
export type { Country }

export function countryByCode(code: string): Country {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_COUNTRY)!
}

/** Только цифры из строки. */
export function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

/** Сколько цифр в маске. */
export function maskLength(mask: string): number {
  return (mask.match(/#/g) || []).length
}

/** Сколько цифр минимум нужно набрать, чтобы номер считался полным. */
export function minNational(c: Country): number {
  return MIN_NATIONAL[c.code] ?? maskLength(c.mask)
}

/** Потолок: в международном номере (E.164) не больше 15 цифр вместе с кодом. */
export function maxNational(c: Country): number {
  return Math.max(maskLength(c.mask), 15 - digitsOf(c.dial).length)
}

/** Расставляет разделители маски по набранным цифрам. Лишние цифры — хвостом. */
export function formatNational(digits: string, mask: string): string {
  let out = ''
  let i = 0
  for (const ch of mask) {
    if (i >= digits.length) break
    out += ch === '#' ? digits[i++] : ch
  }
  return i < digits.length ? `${out} ${digits.slice(i)}` : out
}

/** Номер целиком: «+995 555 12 34 56». */
export function fullPhone(c: Country, national: string): string {
  return national ? `${c.dial} ${formatNational(national, c.mask)}` : c.dial
}

/** Подсказка в пустом поле: маска цифрами. */
export function maskPlaceholder(mask: string): string {
  return mask.replace(/#/g, '0')
}

/**
 * Разбирает сохранённый номер обратно на страну и национальную часть.
 * Номер без «плюса» считаем местным (страна по умолчанию).
 */
export function parsePhone(value: string): { code: string; national: string } {
  const raw = (value || '').trim()
  const digits = digitsOf(raw)
  if (!digits) return { code: DEFAULT_COUNTRY, national: '' }

  const international = raw.startsWith('+') || raw.startsWith('00')
  if (international) {
    const rest = raw.startsWith('00') ? digits.replace(/^00/, '') : digits
    let best: Country | undefined
    for (const c of COUNTRIES) {
      const dial = digitsOf(c.dial)
      if (!rest.startsWith(dial)) continue
      if (!best) {
        best = c
        continue
      }
      const bestDial = digitsOf(best.dial)
      // Длиннее совпавший код — точнее; при равной длине выигрывает основная
      // страна этого кода (+1 → США, +7 → Россия).
      if (dial.length > bestDial.length || (dial.length === bestDial.length && c.primary && !best.primary)) {
        best = c
      }
    }
    if (best) return { code: best.code, national: rest.slice(digitsOf(best.dial).length) }
  }
  return { code: DEFAULT_COUNTRY, national: digits }
}

/** Номер заполнен полностью (для блокировки кнопки «Забронировать»). */
export function phoneValid(value: string): boolean {
  const { code, national } = parsePhone(value)
  const c = countryByCode(code)
  return national.length >= minNational(c) && national.length <= maxNational(c)
}

const NAMES = new Map<Lang, Intl.DisplayNames | null>()

/**
 * Справочник названий стран от браузера. Если данных нужного языка у него нет,
 * он молча подставляет свой язык — в этом случае берём английские названия,
 * а не случайный третий язык.
 */
function displayNames(lang: Lang): Intl.DisplayNames | null {
  const cached = NAMES.get(lang)
  if (cached !== undefined) return cached
  let dn: Intl.DisplayNames | null = null
  try {
    const want = localeFor(lang)
    dn = new Intl.DisplayNames([want], { type: 'region' })
    if (dn.resolvedOptions().locale.split('-')[0] !== want.split('-')[0]) {
      const en = new Intl.DisplayNames(['en'], { type: 'region' })
      dn = en.resolvedOptions().locale.split('-')[0] === 'en' ? en : null
    }
  } catch {
    dn = null // старый браузер — обойдёмся английскими названиями из справочника
  }
  NAMES.set(lang, dn)
  return dn
}

/** Название страны на языке интерфейса (из браузера, с запасным английским). */
export function countryName(c: Country, lang: Lang): string {
  try {
    const name = displayNames(lang)?.of(c.code)
    if (name && name !== c.code) return name
  } catch {
    // код вроде XK браузер может не знать — покажем своё название
  }
  return c.name
}

export interface CountryOption {
  country: Country
  /** Название на языке интерфейса. */
  label: string
}

/** Список для выпадашки: Грузия первой, дальше — по алфавиту языка интерфейса. */
export function countryOptions(lang: Lang): CountryOption[] {
  const items: CountryOption[] = COUNTRIES.map((country) => ({ country, label: countryName(country, lang) }))
  const collator = new Intl.Collator(localeFor(lang))
  items.sort((a, b) => collator.compare(a.label, b.label))
  const at = items.findIndex((i) => i.country.code === DEFAULT_COUNTRY)
  if (at > 0) items.unshift(items.splice(at, 1)[0])
  return items
}

/** Поиск по названию (на любом из языков), коду страны и телефонному коду. */
export function countryMatches(item: CountryOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = digitsOf(q)
  if (digits && digitsOf(item.country.dial).startsWith(digits)) return true
  return (
    item.label.toLowerCase().includes(q) ||
    item.country.name.toLowerCase().includes(q) ||
    item.country.code.toLowerCase() === q
  )
}
