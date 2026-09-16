/**
 * Which browser Playwright drives (ADR-0005 §6).
 *
 * Three cases, and the distinction between two of them is the whole point:
 *
 *   unset  -> 'chrome'    the Chrome already installed on the machine
 *   ''     -> undefined   Playwright's bundled Chromium — what CI asks for
 *   other  -> as given    any other channel, e.g. 'msedge'
 *
 * Neither `??` nor `||` can express this. `raw ?? 'chrome'` lets an empty string
 * through as a channel name, and `raw || 'chrome'` turns the CI request for
 * bundled Chromium into a request for installed Chrome — the exact opposite of
 * what was asked. Only explicit comparisons are correct here.
 */
export function resolvePlaywrightChannel(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return 'chrome'
  }
  if (raw === '') {
    return undefined
  }
  return raw
}
