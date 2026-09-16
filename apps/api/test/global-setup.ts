import { execFileSync } from 'node:child_process'

import { API_DIR, loadTestEnv } from './test-env'

/**
 * Brings oddo_test up to the current migration state once per `pnpm test`.
 *
 * `migrate deploy` (not `migrate dev`) on purpose: it only applies committed
 * migrations and never tries to generate, reset or prompt.
 */
export default function globalSetup(): void {
  loadTestEnv()

  const prismaCli = require.resolve('prisma/build/index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: process.env,
    stdio: 'inherit',
  })
}
