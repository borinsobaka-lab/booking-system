// Простейший хэш-роутинг без внешних зависимостей.
// Клиент — по умолчанию ('' / '#/'), админка — '#/admin...'.

import { useSyncExternalStore } from 'react'

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
  return path === '/admin' || path.startsWith('/admin/')
}
