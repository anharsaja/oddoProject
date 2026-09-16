/**
 * Shared Prettier configuration for the whole workspace.
 * Style follows the code samples in docs/adr/* (no semicolons, single quotes).
 *
 * @type {import('prettier').Config}
 */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
}
