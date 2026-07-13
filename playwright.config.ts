import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199/booking-system/',
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Tbilisi',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/booking-system/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
