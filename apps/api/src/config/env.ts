import path from 'node:path'

import { config as loadDotenv } from 'dotenv'

import {
  EnvValidationError,
  formatEnvValidationError,
  parseEnv,
  type Env,
} from './env.schema'

/**
 * Repository root, four levels up from this file both in `src/` and in the
 * compiled `dist/` tree (apps/api/<src|dist>/config -> repo root).
 */
export const REPO_ROOT = path.resolve(__dirname, '../../../..')

export const ENV_FILE_PATH = path.join(REPO_ROOT, '.env')

let cached: Env | undefined

/**
 * Reads the single root .env. Values already present in process.env win, so a
 * CI runner or a shell export is never overwritten by the file.
 */
export function loadDotenvFiles(): void {
  loadDotenv({ path: ENV_FILE_PATH })
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}

/** Only used by tests that need to re-read process.env after changing it. */
export function resetEnvCache(): void {
  cached = undefined
}

/**
 * Boot guard for BR-INFRA-001: fail loudly and immediately, before Nest builds
 * anything and long before a port is opened.
 */
export function loadEnvOrExit(): Env {
  loadDotenvFiles()
  try {
    return getEnv()
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stdout.write(formatEnvValidationError(error, ENV_FILE_PATH))
      process.exit(1)
    }
    throw error
  }
}

export type { Env }
