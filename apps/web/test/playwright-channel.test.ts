import { describe, expect, it } from 'vitest'

import { resolvePlaywrightChannel } from '../e2e/playwright-channel'

/**
 * Tested through the function, never by launching Playwright: the bundled
 * Chromium branch is precisely the one that cannot run on a machine that
 * deliberately never downloaded it (AC-001b-15 a).
 */
describe('resolvePlaywrightChannel', () => {
  it('defaults to the Chrome installed on the machine', () => {
    expect(resolvePlaywrightChannel(undefined)).toBe('chrome')
  })

  it('reads an empty value as a request for the bundled Chromium', () => {
    expect(resolvePlaywrightChannel('')).toBeUndefined()
  })

  it('passes any other channel through untouched', () => {
    expect(resolvePlaywrightChannel('msedge')).toBe('msedge')
    expect(resolvePlaywrightChannel('chrome-beta')).toBe('chrome-beta')
  })
})
