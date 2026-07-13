// Точка входа Cloudflare Worker: строит хранилище из окружения и передаёт
// запрос в обработчики.

import { handle } from './src/api.js'
import { GitHubStore } from './src/store.js'

export default {
  async fetch(request, env) {
    const store = new GitHubStore(env)
    return handle(request, env, {
      store,
      now: () => Date.now(),
      rnd: () => Math.random(),
    })
  },
}
