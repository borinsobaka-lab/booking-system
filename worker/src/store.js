// Хранилище данных в приватном GitHub-репозитории (один файл data.json).
// Оптимистическая конкурентность через sha файла.

import { utf8ToBase64, base64ToUtf8, emptyData } from './logic.js'

const API = 'https://api.github.com'

export class GitHubStore {
  constructor(env) {
    this.repo = env.DATA_REPO // "owner/repo"
    this.branch = env.DATA_BRANCH || 'main'
    this.path = env.DATA_PATH || 'data.json'
    this.token = env.DATA_TOKEN
  }

  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'booking-system-worker',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  url() {
    return `${API}/repos/${this.repo}/contents/${encodeURIComponent(this.path)}`
  }

  /** Прочитать data.json. Если файла нет — вернуть пустые данные и sha=null. */
  /** fetch с повтором при временных ошибках GitHub (502/503/504). */
  async fetchRetry(url, opts, attempts = 4) {
    let res
    for (let i = 0; i < attempts; i++) {
      res = await fetch(url, opts)
      if (res.status < 500) return res
      // Временный сбой шлюза GitHub — ждём и пробуем снова.
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
    return res
  }

  async get() {
    const res = await this.fetchRetry(`${this.url()}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers() })
    if (res.status === 404) return { data: emptyData(), sha: null }
    if (!res.ok) throw new Error(`GitHub get ${res.status}: ${await res.text()}`)
    const json = await res.json()
    const raw = base64ToUtf8(json.content)
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      data = emptyData()
    }
    return { data: { ...emptyData(), ...data }, sha: json.sha }
  }

  /** Записать data.json. Бросает конфликт (409), если sha устарел. */
  async put(data, sha, message) {
    const body = {
      message: message || 'update data',
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      branch: this.branch,
    }
    if (sha) body.sha = sha
    const res = await this.fetchRetry(this.url(), {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 409) {
      const err = new Error('conflict')
      err.conflict = true
      throw err
    }
    if (!res.ok) throw new Error(`GitHub put ${res.status}: ${await res.text()}`)
    const json = await res.json()
    return { sha: json.content?.sha }
  }

  /** Прочитать → изменить → записать с повтором при конфликте. */
  async update(mutator, message, attempts = 4) {
    let lastErr
    for (let i = 0; i < attempts; i++) {
      const { data, sha } = await this.get()
      const next = mutator(data)
      if (next === null) return { data, sha, skipped: true }
      try {
        const r = await this.put(next, sha, message)
        return { data: next, sha: r.sha }
      } catch (e) {
        if (e && e.conflict) {
          lastErr = e
          continue
        }
        throw e
      }
    }
    throw lastErr || new Error('update failed')
  }
}
