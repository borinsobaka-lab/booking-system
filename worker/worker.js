// Точка входа Cloudflare Worker: строит хранилище из окружения и передаёт
// запрос в обработчики.

import { handle } from './src/api.js'
import { GitHubStore } from './src/store.js'
import { runReminders, runReviewRequests } from './src/email.js'

export default {
  async fetch(request, env) {
    const store = new GitHubStore(env)
    return handle(request, env, {
      store,
      now: () => Date.now(),
      rnd: () => Math.random(),
    })
  },

  // Cron (см. [triggers] в wrangler.toml): напоминания «за час» до сеанса и
  // просьбы оценить специалиста через ~10 минут после сеанса.
  // Ничего не делает, пока не задан секрет RESEND_API_KEY.
  async scheduled(event, env, ctx) {
    const store = new GitHubStore(env)
    const now = Date.now()
    ctx.waitUntil(
      (async () => {
        await runReminders(env, store, now).catch((e) => console.error('reminders failed', e && e.message))
        await runReviewRequests(env, store, now).catch((e) => console.error('review requests failed', e && e.message))
      })(),
    )
  },
}
