// Клиент Cloudflare Worker API (remote-режим). Токен сессии сотрудника хранится
// в sessionStorage; персональные данные приходят только авторизованным.

import { apiBase } from './config'
import type { Booking, DB } from './types'

const SESSION_KEY = 'booking-remote-session'

export interface RemoteUser {
  id: string
  name: string
  role: 'owner' | 'admin' | 'master'
  specialistId?: string
}

interface Session {
  token: string
  user: RemoteUser
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function setSession(s: Session | null) {
  if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else sessionStorage.removeItem(SESSION_KEY)
}

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(apiBase() + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(body?.error || `Ошибка сервера (${res.status})`)
  return body
}

function authHeaders(): Record<string, string> {
  const s = getSession()
  return s ? { Authorization: `Bearer ${s.token}` } : {}
}

export async function fetchPublic(): Promise<any> {
  return api('/api/public')
}

export interface BookingPayload {
  specialistId: string
  serviceId: string
  date: string
  start: string
  clientName: string
  clientPhone: string
  clientEmail?: string
  comment?: string
  consent: boolean
}

export async function submitBooking(payload: BookingPayload): Promise<Booking> {
  const r = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
  return r.booking as Booking
}

export async function login(username: string, password: string): Promise<RemoteUser> {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  setSession({ token: r.token, user: r.user })
  return r.user
}

export function logout() {
  setSession(null)
}

export async function fetchAdminData(): Promise<DB> {
  const r = await api('/api/data', { headers: authHeaders() })
  return r.data as DB
}

export async function saveAdminData(data: DB): Promise<void> {
  await api('/api/data', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ data }) })
}

/** Публичные данные → форма DB для локальных расчётов доступности на витрине. */
export function publicToDB(pub: any): DB {
  return {
    version: 1,
    users: [],
    brand: pub.brand,
    settings: pub.settings ?? { minLeadMinutes: 0 },
    services: pub.services ?? [],
    specialists: (pub.specialists ?? []).map((s: any) => ({ ...s, createdAt: s.createdAt ?? 0 })),
    schedules: pub.schedules ?? [],
    // «Занятость» без персональных данных — достаточно для расчёта свободных слотов.
    bookings: (pub.busy ?? []).map((b: any, i: number) => ({
      id: `busy_${i}`,
      specialistId: b.specialistId,
      serviceId: '',
      date: b.date,
      start: b.start,
      end: b.end,
      status: 'confirmed' as const,
      createdAt: 0,
    })),
    reviews: (pub.reviews ?? []).map((r: any) => ({ ...r, avatar: r.avatar ?? null, createdAt: 0 })),
  }
}
