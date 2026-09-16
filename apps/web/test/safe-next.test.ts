import { describe, expect, it } from 'vitest'

import { DEFAULT_NEXT_PATH, resolveNextPath } from '@/lib/safe-next'

describe('resolveNextPath', () => {
  it('keeps a plain relative path', () => {
    expect(resolveNextPath('/settings/users')).toBe('/settings/users')
    expect(resolveNextPath('/')).toBe('/')
  })

  it('keeps the query string and fragment of a relative path', () => {
    expect(resolveNextPath('/orders?page=2')).toBe('/orders?page=2')
    expect(resolveNextPath('/orders#top')).toBe('/orders#top')
  })

  it('rejects an absolute URL', () => {
    expect(resolveNextPath('https://contoh.com')).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath('http://contoh.com/path')).toBe(DEFAULT_NEXT_PATH)
  })

  /** Protocol-relative: the browser reads this as a different host entirely. */
  it('rejects a protocol-relative URL', () => {
    expect(resolveNextPath('//contoh.com')).toBe(DEFAULT_NEXT_PATH)
  })

  /** Some browsers normalise a backslash into a slash, making this `//contoh.com`. */
  it('rejects a backslash escape', () => {
    expect(resolveNextPath('/\\contoh.com')).toBe(DEFAULT_NEXT_PATH)
  })

  /**
   * URLSearchParams decodes before this function ever sees the value, so the
   * encoded form arrives here already unfolded into the case above.
   */
  it('rejects the percent-encoded form of a protocol-relative URL', () => {
    expect(resolveNextPath(decodeURIComponent('%2F%2Fcontoh.com'))).toBe(DEFAULT_NEXT_PATH)
  })

  it('rejects the login page, which would send the visitor in a circle', () => {
    expect(resolveNextPath('/login')).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath('/login?next=/somewhere')).toBe(DEFAULT_NEXT_PATH)
  })

  it('falls back for empty, whitespace, missing and non-string input', () => {
    expect(resolveNextPath('')).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath('   ')).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath(null)).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath(undefined)).toBe(DEFAULT_NEXT_PATH)
  })

  it('rejects a bare path with no leading slash', () => {
    expect(resolveNextPath('settings')).toBe(DEFAULT_NEXT_PATH)
    expect(resolveNextPath('contoh.com')).toBe(DEFAULT_NEXT_PATH)
  })
})
