import { defineConfig } from '@playwright/test'

/**
 * Two-device sync tests. Each test opens separate browser contexts on one
 * origin (separate IndexedDB / localStorage = separate devices) and talks to
 * a local in-memory Jazz sync server instead of Jazz Cloud, so runs are
 * hermetic and leave nothing behind.
 */
const SYNC_PORT = 4210
const APP_PORT = 5177

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `./node_modules/.bin/jazz-run sync --port ${SYNC_PORT} --in-memory`,
      port: SYNC_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `./node_modules/.bin/vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_JAZZ_SYNC_PEER: `ws://127.0.0.1:${SYNC_PORT}`, VITE_JAZZ_API_KEY: '' },
    },
  ],
})
