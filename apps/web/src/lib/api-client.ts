import { ErrorCode, type ApiErrorResponse } from '@oddo/shared'

import { API_URL } from './config'
import { browserNavigation } from './navigation'
import { resolveNextPath } from './safe-next'

/**
 * An error the API answered with. Carries the stable `code` for branching and
 * the human `message` for display — and deliberately nothing else: `requestId`
 * and the rest of the envelope belong in logs, not on screen.
 */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number

  constructor(message: string, code: ErrorCode, statusCode: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
  }
}

/** The request never reached the API at all — a different problem from any HTTP status. */
export class ApiUnreachableError extends Error {
  readonly url: string

  constructor(url: string) {
    super(`Tidak dapat menghubungi server di ${url}`)
    this.name = 'ApiUnreachableError'
    this.url = url
  }
}

/**
 * A 401 from anywhere other than the login form means the session is gone —
 * expired, revoked, or past its absolute ceiling — and the only useful place to
 * send someone is the login page, with where they were so they can be returned
 * there afterwards.
 *
 * The login page is excluded because a 401 there means 'wrong password', and
 * redirecting would replace the explanation with the same form again.
 */
function redirectToLogin(): void {
  if (typeof window === 'undefined' || browserNavigation.isOnLoginPage()) {
    return
  }

  const next = resolveNextPath(browserNavigation.currentPath())
  browserNavigation.assign(`/login?next=${encodeURIComponent(next)}`)
}

function readErrorBody(body: unknown, statusCode: number): ApiError {
  if (typeof body === 'object' && body !== null) {
    const envelope = body as Partial<ApiErrorResponse>
    if (typeof envelope.message === 'string' && typeof envelope.code === 'string') {
      return new ApiError(envelope.message, envelope.code as ErrorCode, statusCode)
    }
  }
  return new ApiError('Terjadi kesalahan pada server', ErrorCode.INTERNAL_ERROR, statusCode)
}

/**
 * The single way this app talks to the API.
 *
 * `credentials: 'include'` is the whole reason it exists: the session lives in
 * an httpOnly cookie, so a fetch that forgets it is a request that is silently
 * anonymous.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiUnreachableError(API_URL)
  }

  if (response.status === 401) {
    redirectToLogin()
  }

  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    throw readErrorBody(body, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
