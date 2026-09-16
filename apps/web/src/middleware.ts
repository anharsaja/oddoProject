import { NextResponse, type NextRequest } from 'next/server'

/**
 * Duplicated from the API on purpose: this runs in the Edge runtime and cannot
 * import from apps/api, and @oddo/shared does not carry it. Renaming the cookie
 * means changing it in both places — see the note left for the Mentor session.
 */
const SESSION_COOKIE_NAME = 'oddo_session'

const LOGIN_PATH = '/login'

/** Pages reachable without a session. Must stay in step with the API's @Public() set. */
const PUBLIC_PATHS = new Set([LOGIN_PATH, '/health'])

/**
 * A UX guard, NOT a security boundary (BR-AUTH-010).
 *
 * It runs on the Edge, has no access to Redis, and therefore cannot tell a live
 * session from a revoked one — it only sees whether a cookie is present. That is
 * a limit of where it runs, not an omission: the real boundary is the global
 * AuthGuard in the API, which this never touches, because API requests do not
 * pass through here at all.
 *
 * What it buys is the difference between "redirected before anything renders"
 * and "a flash of an empty page, then a redirect".
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME)

  if (pathname === LOGIN_PATH) {
    if (!hasSessionCookie) {
      return NextResponse.next()
    }
    const home = request.nextUrl.clone()
    home.pathname = '/'
    home.search = ''
    return NextResponse.redirect(home)
  }

  if (PUBLIC_PATHS.has(pathname) || hasSessionCookie) {
    return NextResponse.next()
  }

  const login = request.nextUrl.clone()
  login.pathname = LOGIN_PATH
  login.search = ''
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  // Static assets only. /health and /login are compared exactly above rather
  // than excluded by a prefix here, so a future /healthz would not be exempted
  // by accident.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
