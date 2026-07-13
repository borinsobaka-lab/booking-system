// Локальный мок Worker'а для проверки интеграции SPA ↔ API без GitHub:
// те же обработчики (api.js), но хранилище — в памяти.
import http from 'node:http'
import { handle } from './src/api.js'
import { emptyData } from './src/logic.js'

function makeStore() {
  let data = emptyData()
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
const env = { SESSION_SECRET: 'mock-secret', CORS_ORIGIN: '*' }
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
