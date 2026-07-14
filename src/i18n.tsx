// Мультиязычный интерфейс клиента (EN по умолчанию, плюс KA и RU).
// Содержит словарь строк UI и локализованное форматирование дат/цен/длительности.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { fromDateKey } from './time'
import type { Lang } from './types'

export const DEFAULT_LANG: Lang = 'en'
const STORAGE_KEY = 'booking-lang'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ka', label: 'GE' },
  { code: 'ru', label: 'RU' },
]

function localeFor(lang: Lang): string {
  return lang === 'en' ? 'en-US' : lang === 'ka' ? 'ka-GE' : 'ru-RU'
}

// --- Словарь строк интерфейса клиента ---
type Dict = Record<string, Record<Lang, string>>
const DICT: Dict = {
  'landing.lead': {
    en: 'Book online in a minute. Where do we start?',
    ka: 'დაჯავშნეთ ონლაინ ერთ წუთში. საიდან დავიწყოთ?',
    ru: 'Онлайн-запись за минуту. С чего начнём?',
  },
  'entry.master': { en: 'Specialist', ka: 'სპეციალისტი', ru: 'Мастер' },
  'entry.master.sub': {
    en: 'Pick a specialist, then service and time',
    ka: 'აირჩიეთ სპეციალისტი, შემდეგ სერვისი და დრო',
    ru: 'Выбрать мастера, потом услугу и время',
  },
  'entry.date': { en: 'Pick a date', ka: 'აირჩიეთ თარიღი', ru: 'Выбрать дату' },
  'entry.date.sub': {
    en: 'Free date & time → service → specialist',
    ka: 'თავისუფალი თარიღი და დრო → სერვისი → სპეციალისტი',
    ru: 'Свободные дата и время → услуга → мастер',
  },
  'entry.service': { en: 'Pick a service', ka: 'აირჩიეთ სერვისი', ru: 'Выбрать услугу' },
  'entry.service.sub': {
    en: 'Service → specialist → date & time',
    ka: 'სერვისი → სპეციალისტი → თარიღი და დრო',
    ru: 'Услуга → мастер → дата и время',
  },
  'showcase.title': { en: 'Our services', ka: 'ჩვენი სერვისები', ru: 'Наши услуги' },
  'notConfigured': {
    en: 'The studio is being set up. Please check back a little later.',
    ka: 'სტუდია ეწყობა. გთხოვთ, შემოიხედოთ ცოტა მოგვიანებით.',
    ru: 'Салон ещё настраивается. Загляните чуть позже.',
  },
  'loading': { en: 'Loading…', ka: 'იტვირთება…', ru: 'Загрузка…' },
  'back': { en: 'Back', ka: 'უკან', ru: 'Назад' },

  'step.specialist': { en: 'Choose a specialist', ka: 'აირჩიეთ სპეციალისტი', ru: 'Выберите мастера' },
  'step.service': { en: 'Choose a service', ka: 'აირჩიეთ სერვისი', ru: 'Выберите услугу' },
  'step.date': { en: 'Choose a date', ka: 'აირჩიეთ თარიღი', ru: 'Выберите дату' },
  'step.time': { en: 'Choose a time', ka: 'აირჩიეთ დრო', ru: 'Выберите время' },
  'step.datetime': { en: 'Choose date & time', ka: 'აირჩიეთ თარიღი და დრო', ru: 'Выберите дату и время' },
  'step.confirm': { en: 'Confirmation', ka: 'დადასტურება', ru: 'Подтверждение' },
  'continue': { en: 'Continue', ka: 'გაგრძელება', ru: 'Продолжить' },
  'more': { en: 'Show more', ka: 'მეტის ჩვენება', ru: 'Развернуть' },
  'less': { en: 'Show less', ka: 'ნაკლების ჩვენება', ru: 'Свернуть' },
  'specialist.select': {
    en: 'Choose this specialist',
    ka: 'ამ სპეციალისტის არჩევა',
    ru: 'Выбрать этого специалиста',
  },
  'specialist.closeBio': { en: 'Close bio', ka: 'ბიოგრაფიის დახურვა', ru: 'Закрыть биографию' },
  'nearest': { en: 'Nearest slots', ka: 'უახლოესი დრო', ru: 'Ближайшие слоты' },
  'today': { en: 'today', ka: 'დღეს', ru: 'сегодня' },

  'empty.noSpecialists': {
    en: 'No specialists for this service yet.',
    ka: 'ამ სერვისისთვის სპეციალისტები ჯერ არ არის.',
    ru: 'Пока нет мастеров для этой услуги.',
  },
  'empty.noServices': {
    en: 'No available services for this selection.',
    ka: 'ამ არჩევანისთვის ხელმისაწვდომი სერვისები არ არის.',
    ru: 'Нет доступных услуг для этого выбора.',
  },
  'empty.pickDate': { en: 'Choose a date first.', ka: 'ჯერ აირჩიეთ თარიღი.', ru: 'Сначала выберите дату.' },
  'empty.noTime': {
    en: 'No free time on this day.',
    ka: 'ამ დღეს თავისუფალი დრო არ არის.',
    ru: 'На этот день нет свободного времени.',
  },
  'specialist.busy': { en: 'busy at this time', ka: 'დაკავებულია ამ დროს', ru: 'занят в это время' },
  'cal.available': { en: 'time available', ka: 'თავისუფალი დროა', ru: 'есть свободное время' },

  'label.service': { en: 'Service', ka: 'სერვისი', ru: 'Услуга' },
  'label.specialist': { en: 'Specialist', ka: 'სპეციალისტი', ru: 'Мастер' },
  'label.when': { en: 'When', ka: 'როდის', ru: 'Когда' },
  'label.dateTime': { en: 'Date and time', ka: 'თარიღი და დრო', ru: 'Дата и время' },
  'label.serviceCost': { en: 'Service cost', ka: 'სერვისის ღირებულება', ru: 'Стоимость услуги' },
  'label.total': { en: 'Total', ka: 'სულ გადასახდელი', ru: 'Итого к оплате' },
  'label.name': { en: 'Name', ka: 'სახელი', ru: 'Имя' },
  'label.phone': { en: 'Phone number', ka: 'ტელეფონის ნომერი', ru: 'Номер телефона' },
  'label.email': { en: 'Email', ka: 'ელფოსტა', ru: 'Email' },
  'label.comment': { en: 'Comment', ka: 'კომენტარი', ru: 'Комментарий' },

  'form.yourData': { en: 'Your details', ka: 'თქვენი მონაცემები', ru: 'Ваши данные' },
  'form.namePh': { en: 'How should we address you', ka: 'როგორ მოგმართოთ', ru: 'Как к вам обращаться' },
  'form.emailErr': { en: 'Check the email address', ka: 'შეამოწმეთ ელფოსტა', ru: 'Проверьте адрес почты' },
  'form.commentPh': {
    en: 'Any wishes (optional)',
    ka: 'სურვილები (არასავალდებულო)',
    ru: 'Пожелания к записи (необязательно)',
  },
  'form.consent': {
    en: 'I agree to the processing of my personal data, including special categories, to make a booking.',
    ka: 'ვეთანხმები ჩემი პერსონალური მონაცემების, მათ შორის სპეციალური კატეგორიების, დამუშავებას ჯავშნის გასაფორმებლად.',
    ru: 'Я согласен(а) на обработку моих персональных данных, в том числе специальных категорий, для оформления записи.',
  },
  'form.book': { en: 'Book now', ka: 'დაჯავშნა', ru: 'Забронировать' },

  'done.title': { en: "You're booked!", ka: 'თქვენ დაჯავშნილი ხართ!', ru: 'Вы записаны!' },
  'done.sub': {
    en: 'Your booking is confirmed automatically.',
    ka: 'ჯავშანი ავტომატურად დადასტურდა.',
    ru: 'Запись подтверждена автоматически.',
  },
  'done.again': { en: 'Book again', ka: 'ხელახლა დაჯავშნა', ru: 'Записаться ещё раз' },
  'reviews.title': { en: 'Reviews', ka: 'შეფასებები', ru: 'Отзывы' },
  'reviews.none': { en: 'No reviews yet', ka: 'ჯერ არ არის შეფასებები', ru: 'Пока нет отзывов' },
  'reviews.new': { en: 'No reviews', ka: 'შეფასებები არ არის', ru: 'Нет отзывов' },
  'error.booking': {
    en: 'Could not create the booking. Try another time.',
    ka: 'ჯავშნის შექმნა ვერ მოხერხდა. სცადეთ სხვა დრო.',
    ru: 'Не удалось создать запись. Попробуйте другое время.',
  },
}

// --- Форматирование ---
export function fmtDuration(min: number, lang: Lang): string {
  const u = { min: { en: 'min', ka: 'წთ', ru: 'мин' }, h: { en: 'h', ka: 'სთ', ru: 'ч' } }
  if (min < 60) return `${min} ${u.min[lang]}`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} ${u.h[lang]} ${m} ${u.min[lang]}` : `${h} ${u.h[lang]}`
}

export function fmtPrice(v: number, lang: Lang): string {
  return `${new Intl.NumberFormat(localeFor(lang)).format(v)} ₾`
}

/** «3 reviews / 3 отзыва / 3 შეფასება» рядом со звёздами. */
export function fmtReviewCount(n: number, lang: Lang): string {
  if (lang === 'en') return `${n} review${n === 1 ? '' : 's'}`
  if (lang === 'ka') return `${n} შეფასება`
  const m10 = n % 10
  const m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? 'отзыв' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'отзыва' : 'отзывов'
  return `${n} ${word}`
}

// Локализация дат вручную (надёжнее Intl: грузинский всегда переводится).
const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ka: ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
}
// Родительный падеж для «13 <месяца>» (важно для русского).
const MONTHS_GEN: Record<Lang, string[]> = {
  en: MONTHS.en,
  ka: MONTHS.ka,
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
}
// Дни недели, начиная с понедельника (для заголовков календаря).
const WEEKDAYS_SHORT: Record<Lang, string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ka: ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
}
// Полные названия дней, индекс = Date.getDay() (0 = воскресенье).
const WEEKDAYS_LONG: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ka: ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
}

export function fmtFull(dateKey: string, lang: Lang): string {
  const d = fromDateKey(dateKey)
  return `${WEEKDAYS_LONG[lang][d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[lang][d.getMonth()]}`
}

export function fmtMonthYear(year: number, month: number, lang: Lang): string {
  return `${MONTHS[lang][month]} ${year}`
}

/** Короткая дата «13 июля» (без дня недели). */
export function fmtDayShort(dateKey: string, lang: Lang): string {
  const d = fromDateKey(dateKey)
  return `${d.getDate()} ${MONTHS_GEN[lang][d.getMonth()]}`
}

/** Короткие заголовки дней недели Пн…Вс на языке. */
export function weekdayHeaders(lang: Lang): string[] {
  return WEEKDAYS_SHORT[lang]
}

// --- Контекст ---
interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: keyof typeof DICT | string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function readLang(): Lang {
  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Lang | null
  return saved === 'en' || saved === 'ka' || saved === 'ru' ? saved : DEFAULT_LANG
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const value = useMemo<I18nValue>(() => {
    const setLang = (l: Lang) => {
      try {
        localStorage.setItem(STORAGE_KEY, l)
      } catch {
        // ignore
      }
      setLangState(l)
    }
    const t = (key: string) => DICT[key]?.[lang] ?? DICT[key]?.en ?? key
    return { lang, setLang, t }
  }, [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n вне I18nProvider')
  return ctx
}
