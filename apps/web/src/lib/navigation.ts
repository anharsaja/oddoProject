/**
 * The one place this application leaves a page by touching the browser directly.
 *
 * It exists as an object rather than a bare call so tests can observe the
 * redirect: jsdom refuses to navigate, and a module that calls
 * `window.location.assign` inline can only be tested by not calling it.
 */
export const browserNavigation = {
  assign(url: string): void {
    window.location.assign(url)
  },

  /** Path plus query of the page currently on screen. */
  currentPath(): string {
    return `${window.location.pathname}${window.location.search}`
  },

  /** True when the visitor is already looking at the login page. */
  isOnLoginPage(): boolean {
    return window.location.pathname === '/login'
  },
}
