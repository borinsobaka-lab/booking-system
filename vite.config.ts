import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Публикуется на GitHub Pages по адресу
// https://<owner>.github.io/booking-system/ — поэтому base = '/booking-system/'
export default defineConfig({
  plugins: [react()],
  base: '/booking-system/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
