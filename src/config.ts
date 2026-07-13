// Режим работы приложения:
//  - localStorage (по умолчанию) — данные в браузере, без сервера (демо/разработка);
//  - remote — данные в приватном репозитории через Cloudflare Worker API
//    (задаётся переменной сборки VITE_API_BASE).

export function apiBase(): string | null {
  const v = import.meta.env.VITE_API_BASE?.trim()
  return v ? v.replace(/\/+$/, '') : null
}

export function isRemote(): boolean {
  return apiBase() !== null
}
