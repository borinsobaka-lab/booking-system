// Запоминаем контакты клиента в его же браузере, чтобы при повторной записи
// подставлять их в форму. Это локально на устройстве клиента — удобство, не
// хранение на сервере. Комментарий и согласие каждый раз заполняются заново.

const KEY = 'booking-client-profile'

export interface ClientProfile {
  clientName: string
  clientPhone: string
  clientEmail: string
}

export function loadProfile(): Partial<ClientProfile> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<ClientProfile>) : {}
  } catch {
    return {}
  }
}

export function saveProfile(p: ClientProfile): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ clientName: p.clientName, clientPhone: p.clientPhone, clientEmail: p.clientEmail }),
    )
  } catch {
    // хранилище недоступно — ничего страшного, просто не подставим в следующий раз
  }
}
