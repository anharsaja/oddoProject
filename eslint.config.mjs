import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  base,
  browserEnv,
  nodeEnv,
  noConsoleInAppCode,
  workspaceBoundaries,
} from '@oddo/config/eslint'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * One flat config for the whole workspace. Linting from the root is what makes
 * the cross-package boundary rule (ADR-0001 B1) checkable at all — the zones it
 * compares are only meaningful when both `apps/` and `packages/` are in scope.
 */
export default [
  ...base,
  workspaceBoundaries(rootDir),
  { files: ['apps/api/**/*.ts', 'packages/**/*.ts'], ...nodeEnv },
  { files: ['apps/web/**/*.{ts,tsx}'], ...browserEnv },
  noConsoleInAppCode,
]
