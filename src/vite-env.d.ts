/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL Cloudflare Worker API. Не задан ⇒ локальный режим (localStorage). */
  readonly VITE_API_BASE?: string
}
