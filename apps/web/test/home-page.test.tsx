import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomePage from '@/app/page'
import { browserNavigation } from '@/lib/navigation'

const mocks = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
}))

const actor = {
  id: '01920000-0000-7000-8000-00000000000a',
  email: 'admin@oddo.local',
  name: 'Administrator',
  companyId: '01920000-0000-7000-8000-000000000001',
  isSuperadmin: true,
}

describe('protected home page', () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    vi.unstubAllGlobals()
    vi.spyOn(browserNavigation, 'assign').mockImplementation(() => undefined)
    vi.spyOn(browserNavigation, 'currentPath').mockReturnValue('/')
    vi.spyOn(browserNavigation, 'isOnLoginPage').mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows a loading state while the identity is being fetched (BR-AUTH-012)', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    render(<HomePage />)

    expect(screen.getByTestId('home-loading')).toBeInTheDocument()
    expect(screen.getByTestId('header-user-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/Halo,/)).not.toBeInTheDocument()
  })

  it('greets the user once the identity arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(actor) }),
    )

    render(<HomePage />)

    expect(await screen.findByText('Halo, Administrator')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lihat status infrastruktur' })).toHaveAttribute(
      'href',
      '/health',
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  /**
   * AC-001b-06 at component level: a cookie that survived its session must not
   * produce a blank page on the way to the login screen.
   */
  it('goes to the login page after a 401, without ever showing content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ code: 'UNAUTHORIZED', message: 'Sesi tidak valid' }),
      }),
    )

    render(<HomePage />)

    expect(screen.getByTestId('home-loading')).toBeInTheDocument()

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login?next=%2F')
    })

    expect(screen.queryByText(/Halo,/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sistem sedang terganggu')).not.toBeInTheDocument()
  })

  /**
   * AC-001b-13. An outage is not an expired session, and sending people to the
   * login page would have them typing their password repeatedly at a problem
   * that has nothing to do with it.
   */
  it('reports an outage instead of sending the user to log in again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({ code: 'INTERNAL_ERROR', message: 'Internal server error' }),
      }),
    )

    render(<HomePage />)

    expect(await screen.findByText('Sistem sedang terganggu')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Internal server error')
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('reports an unreachable API the same way, without redirecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<HomePage />)

    expect(await screen.findByText('Sistem sedang terganggu')).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
