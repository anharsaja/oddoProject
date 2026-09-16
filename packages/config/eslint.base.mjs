import path from 'node:path'

import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Paths ESLint never looks at, anywhere in the workspace. */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
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
