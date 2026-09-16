import path from 'node:path'

import { config as loadDotenv } from 'dotenv'

export const REPO_ROOT = path.resolve(__dirname, '../../..')
export const API_DIR = path.resolve(__dirname, '..')

/**
 * Loads .env.test with `override: true`.
 *
 * Overriding matters: if a developer happens to have DATABASE_URL exported in
 * their shell, a non-overriding load would silently point the whole test suite
 * at the development database (AC-000-12).
 */
export function loadTestEnv(): void {
  loadDotenv({ path: path.join(REPO_ROOT, '.env.test'), override: true })
}
