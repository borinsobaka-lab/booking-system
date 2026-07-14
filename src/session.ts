// Подключение хранилища в remote-режиме: что грузим и куда сохраняем в
// зависимости от контекста (витрина клиента vs админка).

import { isRemote } from './config'
import { hydrate, setPersister } from './db'
import * as remote from './remote'
import type { DB } from './types'

let saveTimer: ReturnType<typeof setTimeout> | undefined

/** Витрина клиента: только публичные данные, ничего не сохраняем на сервер. */
export async function enterClient(): Promise<void> {
  if (!isRemote()) return
  setPersister(null)
  const pub = await remote.fetchPublic()
  hydrate(remote.publicToDB(pub))
}

/** Админка: полные данные. Сохранение на сервер — только для владельца;
 *  сотрудники работают в режиме просмотра (persister не ставим). */
export async function enterAdmin(): Promise<void> {
  if (!isRemote()) return
  const data = await remote.fetchAdminData()
  hydrate(data)
  const isOwner = remote.getSession()?.user.role === 'owner'
  if (!isOwner) {
    setPersister(null)
    return
  }
  setPersister((db: DB) => {
    clearTimeout(saveTimer)
    const snapshot = structuredClone(db)
    saveTimer = setTimeout(() => {
      void remote.saveAdminData(snapshot).catch((e) => console.error('Не удалось сохранить:', e))
    }, 700)
  })
}

/** Сбросить сохранение (выход). */
export function stopPersisting(): void {
  if (isRemote()) setPersister(null)
}
