// Ручное заведение суперадминистратора (owner). Саморегистрации в системе нет —
// владелец создаётся ТОЛЬКО этим скриптом и коммитится в приватный репозиторий.
//
// Использование:
//   node seed-owner.mjs <логин> <пароль> ["Имя"]      → печатает готовый data.json
//   node seed-owner.mjs <логин> <пароль> "Имя" > data.json
//
// Пароль в открытом виде НИКУДА не сохраняется — в data.json пишутся только
// соль и SHA-256(соль:пароль). Полученный data.json кладётся в приватный
// репозиторий booking-system-data (см. worker/SETUP.md).

import { emptyData, hashPassword } from './src/logic.js'

function randomSalt() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const [, , username, password, name] = process.argv
if (!username || !password) {
  console.error('Использование: node seed-owner.mjs <логин> <пароль> ["Имя"]')
  process.exit(1)
}

const salt = randomSalt()
const passwordHash = await hashPassword(password, salt)

const data = emptyData()
data.users = [
  {
    id: 'owner',
    role: 'owner',
    username: String(username).trim(),
    salt,
    passwordHash,
    name: (name && String(name).trim()) || 'Администратор',
    createdAt: 0,
  },
]

console.log(JSON.stringify(data, null, 2))
