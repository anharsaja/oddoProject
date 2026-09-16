import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppHeader } from '@/components/app-header'
import { API_URL } from '@/lib/config'

const mocks = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
}))

describe('AppHeader', () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows a skeleton, not an empty string, while the identity is unknown', () => {
    render(<AppHeader />)

    expect(screen.getByTestId('header-user-skeleton')).toBeInTheDocument()
    expect(screen.getByText('Oddo ERP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument()
  })

  it('shows the user name once it is known', () => {
    render(<AppHeader userName="Administrator" />)

    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.queryByTestId('header-user-skeleton')).not.toBeInTheDocument()
  })

  it('ends the session on the server before leaving', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppHeader userName="Administrator" />)
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }))

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login')
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_URL}/auth/logout`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  /**
   * A logout that refuses to finish is worse than one that is only believed to
   * have worked: it leaves someone stuck on a page they are trying to leave.
   */
  it('leaves for the login page even when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<AppHeader userName="Administrator" />)
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }))

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login')
    })
  })
})
