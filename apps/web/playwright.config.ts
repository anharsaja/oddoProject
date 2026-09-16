import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'

import { resolvePlaywrightChannel } from './e2e/playwright-channel'

// __dirname, not import.meta: Playwright loads this config as CommonJS.
const projectDir = __dirname
const repoRoot = path.resolve(projectDir, '../..')

// ADR-0005 §1 allows exactly three env files, so E2E does not get a fourth. It
// runs on .env.test — the same oddo_test and Redis index 1 Jest uses — and
// overrides only the three values that have to differ.
loadDotenv({ path: path.join(repoRoot, '.env.test'), override: true })

const E2E_BROWSER_CHANNEL = resolvePlaywrightChannel(process.env['PLAYWRIGHT_CHANNEL'])

const WEB_PORT = 3100
const API_PORT = 3101
const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`
const API_URL = `http://localhost:${String(API_PORT)}/api`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  // Exactly one project (ADR-0005 §6). `channel` comes AFTER the spread on
  // purpose: some Playwright versions put a channel inside the device
  // descriptor, and writing ours first would let theirs win — which would also
  // mean `undefined`, the bundled-Chromium request, never took effect.
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: E2E_BROWSER_CHANNEL },
    },
  ],
  webServer: [
    {
      // Dedicated ports, distinct from the development ones, so a running
      // `pnpm dev` and an E2E run can coexist (§11 no. 9).
      command: 'node dist/main.js',
      cwd: path.join(repoRoot, 'apps', 'api'),
      // A readiness probe, not a health probe. Playwright starts webServer
      // BEFORE globalSetup, so oddo_test is still empty at this point and
      // /api/health would answer 503 for a missing seed row — forever, because
      // the seed is what globalSetup is waiting to run. A 401 here proves what
      // readiness actually means: the process booted, Nest routed, the guard ran.
      url: `${API_URL}/auth/me`,
      // Never borrow a server that is already listening: it would have been
      // started with different environment variables, and the suite would
      // quietly test the wrong thing (§11 no. 10).
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        WEB_ORIGIN,
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
    {
      command: `pnpm exec next dev -p ${String(WEB_PORT)}`,
      cwd: projectDir,
      url: `${WEB_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_API_URL: API_URL,
        WEB_ORIGIN,
      },
    },
  ],
})
