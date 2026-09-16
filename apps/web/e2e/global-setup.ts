import { execSync } from 'node:child_process'
import path from 'node:path'

// __dirname, not import.meta: Playwright loads this as CommonJS.
const repoRoot = path.resolve(__dirname, '../../..')

/**
 * Brings oddo_test up to date and puts the administrator in it.
 *
 * Shelled out to the API's own tooling rather than importing Prisma here:
 * apps/web has no business holding a database client, and reaching across into
 * apps/api for one would be worse.
 *
 * playwright.config.ts has already loaded .env.test, so DATABASE_URL points at
 * oddo_test and these commands cannot touch development data.
 */
export default function globalSetup(): void {
  const run = (command: string): void => {
    execSync(command, { cwd: repoRoot, stdio: 'inherit', env: process.env })
  }

  run('pnpm --filter @oddo/api exec prisma migrate deploy')
  run('pnpm --filter @oddo/api exec ts-node prisma/seed/index.ts')
}
