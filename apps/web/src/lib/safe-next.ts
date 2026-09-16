/** Where a visitor ends up when no usable destination was supplied. */
export const DEFAULT_NEXT_PATH = '/'

/** The login page itself is never a destination to return to. */
const LOGIN_PATH = '/login'

/**
 * Reduces a `?next=` parameter to something safe to redirect to (BR-AUTH-011).
 *
 * Anything that is not a plain relative path becomes `/`. Without this the login
 * page is an open redirect: a link like `/login?next=https://phishing.example`
 * mailed to staff would bounce them to an attacker's site *after* a successful
 * login, carrying the impression that it is part of this application.
 *
 * Rejected values are dropped silently. A visitor never typed this, and showing
 * an error would only tell whoever is probing that their attempt was noticed.
 */
export function resolveNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') {
    return DEFAULT_NEXT_PATH
  }

  const value = raw.trim()

  // Must be relative, and start with exactly one slash. `//host` is a
  // protocol-relative URL, and some browsers read `/\` the same way, so both
  // would leave this origin.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_NEXT_PATH
  }

  const pathOnly = value.split(/[?#]/)[0] ?? ''
  if (pathOnly === LOGIN_PATH) {
    return DEFAULT_NEXT_PATH
  }

  return value
}
