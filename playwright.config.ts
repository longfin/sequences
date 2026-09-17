import { defineConfig } from '@playwright/test'

/**
 * Two-device sync tests. Each test opens separate browser contexts on one
 * origin (separate IndexedDB / localStorage = separate devices) and talks to
 * a local in-memory Jazz sync server instead of Jazz Cloud, so runs are
 * hermetic and leave nothing behind.
 *
 * The app under test is a production build (`vite build` + `vite preview`),
 * not the dev server: React StrictMode's double effects in development make
 * Jazz create two anonymous accounts per page, and the credentials it stores
 * can end up naming a different one than the context that keeps running.
 * Production has no double effects, and that is what ships.
 */
// Both ports are overridable: the defaults only need to be free on the
// machine running the suite, and a developer may already have something on
// them (`E2E_PORT=5299 E2E_SYNC_PORT=4299 npx playwright test`).
const SYNC_PORT = Number(process.env.E2E_SYNC_PORT || 4271)
const APP_PORT = Number(process.env.E2E_PORT || 5271)
const OUT_DIR = 'dist-e2e'

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
      command: `./node_modules/.bin/vite build --outDir ${OUT_DIR} && ./node_modules/.bin/vite preview --outDir ${OUT_DIR} --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_JAZZ_SYNC_PEER: `ws://127.0.0.1:${SYNC_PORT}`, VITE_JAZZ_API_KEY: '' },
    },
  ],
})
