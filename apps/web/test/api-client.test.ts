import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, ApiUnreachableError, apiFetch } from '@/lib/api-client'
import { API_URL } from '@/lib/config'
import { browserNavigation } from '@/lib/navigation'

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    }),
  )
}

describe('apiFetch', () => {
  let assign: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.unstubAllGlobals()
    assign = vi.spyOn(browserNavigation, 'assign').mockImplementation(() => undefined)
    vi.spyOn(browserNavigation, 'currentPath').mockReturnValue('/orders?page=2')
    vi.spyOn(browserNavigation, 'isOnLoginPage').mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the parsed body on success', async () => {
    respondWith(200, { ok: true })

    await expect(apiFetch<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true })
    expect(assign).not.toHaveBeenCalled()
  })

  it('returns nothing for 204 without trying to parse a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }))

    await expect(apiFetch<void>('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('sends the session cookie on every request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/auth/me')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_URL}/auth/me`)
    expect(init.credentials).toBe('include')
  })

  it('sends the visitor to the login page on 401, remembering where they were', async () => {
    respondWith(401, { code: 'UNAUTHORIZED', message: 'Sesi tidak valid' })

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/orders?page=2')}`)
  })

  /**
   * A 401 from the login form means "wrong password". Redirecting would replace
   * the explanation with the very same form.
   */
  it('does not redirect when the visitor is already on the login page', async () => {
    vi.spyOn(browserNavigation, 'isOnLoginPage').mockReturnValue(true)
    respondWith(401, { code: 'UNAUTHORIZED', message: 'Email atau password salah' })

    await expect(apiFetch('/auth/login', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('sanitises the remembered path rather than trusting the address bar', async () => {
    vi.spyOn(browserNavigation, 'currentPath').mockReturnValue('//contoh.com')
    respondWith(401, { code: 'UNAUTHORIZED', message: 'Sesi tidak valid' })

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/')}`)
  })

  it('leaves other failures alone — an outage is not an expired session', async () => {
    respondWith(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' })

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(assign).not.toHaveBeenCalled()
  })

  it('reports an unreachable API as its own kind of failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiUnreachableError)
    expect(assign).not.toHaveBeenCalled()
  })
})
