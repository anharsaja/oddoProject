import type { CookieOptions, Response } from 'express'

import type { Env } from '../../config/env.schema'

/** ADR-0001 B2. The session id lives here and nowhere else — never in a body, never in a log. */
export const SESSION_COOKIE_NAME = 'oddo_session'

function baseOptions(env: Env): Omit<CookieOptions, 'maxAge'> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Only over TLS in production; requiring it in development would stop the
    // cookie being stored at all over plain http://localhost.
    secure: env.NODE_ENV === 'production',
    path: '/',
  }
}

export function setSessionCookie(response: Response, env: Env, sid: string): void {
  response.cookie(SESSION_COOKIE_NAME, sid, {
    ...baseOptions(env),
    maxAge: env.SESSION_ABSOLUTE_TTL_HOURS * 3_600 * 1_000,
  })
}

/**
 * Clearing has to repeat the same attributes it was set with, otherwise the
 * browser treats it as a different cookie and keeps the original.
 */
export function clearSessionCookie(response: Response, env: Env): void {
  response.cookie(SESSION_COOKIE_NAME, '', { ...baseOptions(env), maxAge: 0 })
}

export function readSessionCookie(cookies: unknown): string | undefined {
  if (typeof cookies !== 'object' || cookies === null) {
    return undefined
  }
  const value = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME]
  return typeof value === 'string' && value !== '' ? value : undefined
}
