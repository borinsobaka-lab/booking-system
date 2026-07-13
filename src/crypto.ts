// Хэширование паролей на клиенте (WebCrypto, SHA-256 с солью).
// Пока хранение локальное — это симуляция; при переходе на бэкенд хэширование
// переедет на сервер. Сам пароль никогда не сохраняется.

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return toHex(arr.buffer)
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const h = await hashPassword(password, salt)
  return h === hash
}
