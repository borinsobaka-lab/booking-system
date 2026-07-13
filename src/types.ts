// Доменные типы системы записи на услуги (массаж).

export type ID = string

/** Роли пользователей админки. owner — суперадминистратор (единственный). */
export type Role = 'owner' | 'admin' | 'master'

export interface User {
  id: ID
  role: Role
  /** Логин для входа. */
  username: string
  /** Соль + хэш пароля (SHA-256, hex). Сам пароль нигде не хранится. */
  salt: string
  passwordHash: string
  /** Отображаемое имя сотрудника. */
  name: string
  /** Для мастера — привязка к карточке специалиста (расписание, услуги). */
  specialistId?: ID
  createdAt: number
}

/** Бренд/салон — то, что видит клиент на баннере. */
export interface Brand {
  name: string
  address: string
  /** data-URL аватарки бренда. */
  avatar: string | null
  /** data-URL баннера. */
  banner: string | null
}

export interface Service {
  id: ID
  name: string
  description: string
  /** Длительность в минутах. */
  durationMin: number
  /** Стоимость (в валюте салона). */
  price: number
  /** data-URL картинки услуги. */
  image: string | null
  createdAt: number
}

export interface Specialist {
  id: ID
  firstName: string
  lastName: string
  /** Должность/специализация, например «Массажист». */
  role: string
  /** data-URL аватарки. */
  avatar: string | null
  /** Услуги, которые выполняет специалист. */
  serviceIds: ID[]
  createdAt: number
}

/** Интервал времени в пределах суток, 'HH:MM'. */
export interface TimeRange {
  start: string
  end: string
}

/** Расписание конкретного специалиста на конкретный день. */
export interface DaySchedule {
  specialistId: ID
  /** 'YYYY-MM-DD'. */
  date: string
  /** Рабочие окна дня. Пусто ⇒ выходной. */
  windows: TimeRange[]
  /** Перерывы внутри дня. */
  breaks: TimeRange[]
}

export interface Booking {
  id: ID
  specialistId: ID
  serviceId: ID
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM'. */
  start: string
  /** 'HH:MM', вычисляется из длительности услуги. */
  end: string
  /** Пока запись подтверждается автоматически (симуляция). */
  status: 'confirmed'
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  comment?: string
  /** Согласие клиента на обработку персональных данных. */
  consent?: boolean
  createdAt: number
}

/** Данные, которые клиент вводит в форме брони. */
export interface BookingForm {
  clientName: string
  clientPhone: string
  clientEmail: string
  comment: string
  consent: boolean
}

export interface DB {
  version: number
  users: User[]
  brand: Brand
  services: Service[]
  specialists: Specialist[]
  schedules: DaySchedule[]
  bookings: Booking[]
}
