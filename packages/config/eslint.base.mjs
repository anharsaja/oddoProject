import path from 'node:path'

import nextPlugin from '@next/eslint-plugin-next'
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Paths ESLint never looks at, anywhere in the workspace. */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.next-e2e/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/coverage/**',
  '**/*.tsbuildinfo',
  '**/next-env.d.ts',
  '**/prisma/migrations/**',
]

/**
 * Rules every package in the workspace shares.
 *
 * `no-undef` is switched off for TypeScript on purpose: the compiler already
 * reports unknown identifiers, and keeping the ESLint rule on would force us to
 * re-declare every runtime global (Jest, Node, DOM) a second time.
 */
export const base = [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
]

/** Config fragment for code that runs on Node (the API, seeds, tooling). */
export const nodeEnv = {
  languageOptions: {
    globals: { ...globals.node },
  },
}

/**
 * React and Next rules, scoped to the files that are actually a Next app.
 *
 * The hooks rules are the point: a dependency array that lies produces a stale
 * closure, which shows up much later as 'the screen did not update' and is
 * miserable to trace back. A linter catches it at the line that caused it.
 *
 * @param {string[]} files glob patterns the Next.js application lives in
 */
export function reactAndNext(files) {
  return [
    // configs.flat, not configs: the top-level export is still the legacy shape
    // whose `plugins` is an array of strings, which flat config rejects.
    { files, ...reactHooks.configs.flat['recommended-latest'] },
    { files, ...nextPlugin.configs['core-web-vitals'] },
    {
      files,
      rules: {
        // Pages Router only. This app is App Router, so the rule can never find
        // the directory it looks for and prints a notice on every lint run.
        '@next/next/no-html-link-for-pages': 'off',
      },
    },
  ]
}

/** Config fragment for code that runs in the browser (the Next.js app). */
export const browserEnv = {
  languageOptions: {
    globals: { ...globals.browser },
  },
}

/**
 * ADR-0001 B1: the dependency direction is always `apps -> packages`, never the
 * other way around. A shared package that reaches into an application is no
 * longer shared — it is an application in disguise.
 *
 * @param {string} rootDir absolute path of the workspace root
 */
export function workspaceBoundaries(rootDir) {
  return {
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: path.join(rootDir, 'packages'),
              from: path.join(rootDir, 'apps'),
              message:
                'ADR-0001 B1: packages/** must not import from apps/**. Dependencies flow apps -> packages only.',
            },
          ],
        },
      ],
    },
  }
}

/**
 * ADR-0001 B9 / B4: application source code logs through pino and never through
 * `console`. Standalone scripts (seeds) and tests are exempt because they run
 * outside the Nest dependency-injection container, where no logger exists.
 */
export const noConsoleInAppCode = {
  files: ['apps/*/src/**/*.{ts,tsx}'],
  ignores: ['apps/*/src/**/*.spec.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
  rules: {
    'no-console': 'error',
  },
}

export { tseslint }
