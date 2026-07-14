// Точка входа Cloudflare Worker: строит хранилище из окружения и передаёт
// запрос в обработчики.

import { handle } from './src/api.js'
import { GitHubStore } from './src/store.js'
import { runReminders } from './src/email.js'

export default {
  async fetch(request, env) {
    const store = new GitHubStore(env)
    return handle(request, env, {
      store,
      now: () => Date.now(),
      rnd: () => Math.random(),
    })
  },

  // Cron: напоминания клиентам «за час» до сеанса (см. [triggers] в wrangler.toml).
  // Ничего не делает, пока не задан секрет RESEND_API_KEY.
  async scheduled(event, env, ctx) {
    const store = new GitHubStore(env)
    ctx.waitUntil(
      runReminders(env, store, Date.now()).catch((e) => console.error('reminders failed', e && e.message)),
    )
  },
}
