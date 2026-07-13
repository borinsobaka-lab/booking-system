// Простейший хэш-роутинг без внешних зависимостей.
// Клиент — по умолчанию ('' / '#/'). Админка живёт по ОТДЕЛЬНОМУ адресу
// (ADMIN_BASE) и НИГДЕ не связана ссылками из клиентской витрины — попасть
// в неё можно только зная адрес.

import { useSyncExternalStore } from 'react'

/** Отдельный адрес админ-панели. Меняется здесь — обновляется во всём приложении. */
export const ADMIN_BASE = '/admin-panel'

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function getHash(): string {
  return location.hash.replace(/^#/, '') || '/'
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, getHash, getHash)
}

export function navigate(path: string): void {
  location.hash = path
}

export function isAdminPath(path: string): boolean {
  return path === ADMIN_BASE || path.startsWith(ADMIN_BASE + '/')
}
