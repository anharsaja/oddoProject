import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { REPO_ROOT } from './test-env'

const APPS_DIR = path.join(REPO_ROOT, 'apps')
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx'])

/** Names that must live in @oddo/shared and nowhere else (AC-000-07 a). */
const SHARED_ONLY_TYPES = ['HealthResponse', 'HealthCheckResult']

function collectSourceFiles(directory: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry)

    if (statSync(absolute).isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) {
        found.push(...collectSourceFiles(absolute))
      }
      continue
    }

    if (SCANNED_EXTENSIONS.has(path.extname(entry)) && absolute !== __filename) {
      found.push(absolute)
    }
  }

  return found
}

describe('shared types are declared once, in @oddo/shared', () => {
  it('finds application source files to scan', () => {
    expect(collectSourceFiles(APPS_DIR).length).toBeGreaterThan(0)
  })

  it.each(SHARED_ONLY_TYPES)('no app redeclares %s locally (AC-000-07)', (typeName) => {
    // Assembled at runtime so this file does not match its own pattern.
    const pattern = new RegExp(String.raw`\b(?:interface|type)\s+${typeName}\b`)

    const offenders = collectSourceFiles(APPS_DIR).filter((file) =>
      pattern.test(readFileSync(file, 'utf8')),
    )

    expect(offenders.map((file) => path.relative(REPO_ROOT, file))).toEqual([])
  })
})
