// Работа с локализованным контентом (LocalizedString). Без React — можно
// использовать в слое данных.

import type { Lang, LocalizedString } from './types'

export function emptyLoc(): LocalizedString {
  return { en: '', ka: '', ru: '' }
}

/** Привести значение к LocalizedString. Старые строки копируем во все языки,
 *  чтобы после миграции ничего не отображалось пустым. */
export function toLoc(v: LocalizedString | string | null | undefined): LocalizedString {
  if (v && typeof v === 'object') return { en: v.en || '', ka: v.ka || '', ru: v.ru || '' }
  const s = typeof v === 'string' ? v : ''
  return { en: s, ka: s, ru: s }
}

/** Выбрать строку под язык с фолбэком (lang → en → ru → ka). */
export function pick(v: LocalizedString | string | null | undefined, lang: Lang): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v[lang] || v.en || v.ru || v.ka || ''
}

/** Полное имя специалиста на языке. */
export function specialistName(
  sp: { firstName: LocalizedString | string; lastName: LocalizedString | string },
  lang: Lang,
): string {
  return `${pick(sp.firstName, lang)} ${pick(sp.lastName, lang)}`.trim()
}
