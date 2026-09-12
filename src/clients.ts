// Кто есть кто среди записей.
//
// Одного клиента узнаём и по телефону, и по почте: совпало хотя бы одно —
// значит, это тот же человек и визит у него не первый. Он мог записаться с
// другого номера, но с той же почтой (или наоборот, сменить почту и оставить
// номер), и это всё равно повторный визит.
//
// Связь получается транзитивной: запись A (телефон P, почта E1) и запись B
// (телефон P, почта E2) — один клиент, а раз так, то и запись C (другой номер,
// почта E2) — он же.

import type { Booking } from './types'

/**
 * Ключ телефона — последние 9 цифр. Номер из формы записи приходит в
 * международном виде, но в старых записях и ручных бронях код страны могли не
 * написать, поэтому сравниваем «значимый хвост», а не строку целиком.
 */
export function phoneKey(phone: string | undefined): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length >= 7 ? digits.slice(-9) : ''
}

/** Ключ почты: без регистра и лишних пробелов. */
export function emailKey(email: string | undefined): string {
  return (email || '').trim().toLowerCase()
}

/**
 * Приметы записи, по которым узнаём клиента. Имя — только запасной вариант для
 * записей вообще без контактов (их заводят вручную): по имени разных людей
 * склеивать нельзя, «Ана» в базе не одна.
 */
function marksOf(b: Booking): string[] {
  const marks: string[] = []
  const phone = phoneKey(b.clientPhone)
  if (phone) marks.push('p:' + phone)
  const email = emailKey(b.clientEmail)
  if (email) marks.push('e:' + email)
  if (marks.length === 0) {
    const name = (b.clientName || '').trim().toLowerCase()
    if (name) marks.push('n:' + name)
  }
  return marks
}

/**
 * Разбирает записи по клиентам: возвращает `id записи → ключ клиента`.
 * Записи с общим телефоном или почтой получают один ключ.
 */
export function clientIndex(bookings: Booking[]): Map<string, string> {
  // Объединение множеств: у каждой приметы есть «главная», через неё и
  // сходятся все приметы одного человека.
  const parent = new Map<string, string>()
  const find = (mark: string): string => {
    const up = parent.get(mark)
    if (up === undefined) {
      parent.set(mark, mark)
      return mark
    }
    if (up === mark) return mark
    const root = find(up)
    parent.set(mark, root) // запоминаем короткий путь — второй раз не побежим
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // Отменённые записи тоже связывают: человек тот же, даже если сеанс не был.
  for (const b of bookings) {
    const marks = marksOf(b)
    for (let i = 1; i < marks.length; i++) union(marks[0], marks[i])
  }

  const out = new Map<string, string>()
  for (const b of bookings) {
    const marks = marksOf(b)
    // Ни телефона, ни почты, ни имени — считаем запись отдельным клиентом.
    out.set(b.id, marks.length > 0 ? find(marks[0]) : 'b:' + b.id)
  }
  return out
}
