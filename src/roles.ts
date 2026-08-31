// Роли админки и права, которые они дают. Модуль без React — им пользуются и
// компоненты, и слой данных (src/session.ts).

import type { Role } from './types'

/** Роли, которые суперадминистратор раздаёт в разделе «Пользователи».
 *  Владельца не переназначают, старую роль 'master' больше не выдают. */
export type StaffRole = 'admin' | 'staff'

export function roleLabel(role: Role): string {
  if (role === 'owner') return 'Суперадминистратор'
  if (role === 'admin') return 'Администратор'
  return 'Сотрудник'
}

/** Кто правит расписание: владелец и администратор. */
export function canEditSchedule(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/** Кто правит всё остальное (услуги, специалисты, записи, бренд, учётки). */
export function canManageAll(role: Role): boolean {
  return role === 'owner'
}
