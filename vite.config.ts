import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Публикуется на своём домене booking.neba.space (корень сайта) — поэтому base = '/'.
// Домен задаётся файлом public/CNAME и в Settings → Pages репозитория.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
