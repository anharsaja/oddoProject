import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

// Same .env.test the API tests use, so the URL asserted in the tests and the
// URL shipped in the app cannot drift apart.
loadDotenv({ path: path.resolve(projectDir, '../../.env.test'), override: true })

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(projectDir, 'src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    env: {
      NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? '',
    },
  },
})
