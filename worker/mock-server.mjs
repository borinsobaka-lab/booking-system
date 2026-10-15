// Локальный мок Worker'а для проверки интеграции SPA ↔ API без GitHub:
// те же обработчики (api.js), но хранилище — в памяти.
//
// node mock-server.mjs [seed.json] — начальные данные из файла: полный data.json
// или снимок витрины (`curl …/api/public > seed.json`, занятость станет
// обезличенными записями). Так приложение Lady Stretch разрабатывают на живом
// каталоге и расписании, не создавая записей и писем в боевой системе.
import fs from 'node:fs'
import http from 'node:http'
import { handle } from './src/api.js'
import { emptyData } from './src/logic.js'

function seedData(file) {
  if (!file) return emptyData()
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!raw.busy) return { ...emptyData(), ...raw }
  const { busy, ...pub } = raw
  const bookings = busy.map((b, i) => ({ id: `busy${i}`, serviceId: '', status: 'confirmed', createdAt: 0, ...b }))
  return { ...emptyData(), ...pub, bookings }
}

function makeStore() {
  let data = seedData(process.argv[2])
  let sha = 'sha0'
  return {
    async get() {
      return { data: structuredClone(data), sha }
    },
    async put(next) {
      data = structuredClone(next)
      sha = 'sha' + Math.random()
      return { sha }
    },
    async update(mutator) {
      const cur = structuredClone(data)
      const next = mutator(cur)
      if (next === null) return { data: cur, sha, skipped: true }
      data = structuredClone(next)
      return { data: next, sha }
    },
  }
}

const store = makeStore()
const env = { SESSION_SECRET: 'mock-secret', CORS_ORIGIN: '*', STUDIO_TZ: 'Asia/Tbilisi' }
const deps = { store, now: () => Date.now(), rnd: () => Math.random() }

const server = http.createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })
  const resp = await handle(request, env, deps)
  const text = await resp.text()
  res.writeHead(resp.status, Object.fromEntries(resp.headers))
  res.end(text)
})

const PORT = Number(process.env.PORT || 8787)
server.listen(PORT, () => console.log(`mock worker on http://localhost:${PORT}`))
