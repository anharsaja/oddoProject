import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LoginPage from '@/app/login/page'
import { API_URL } from '@/lib/config'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'admin@oddo.local' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'ChangeMe!2026' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockReset()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders both fields with labels tied to them (AC-001a-12)', () => {
    render(<LoginPage />)

    expect(screen.getByText('Oddo ERP')).toBeInTheDocument()
    expect(screen.getByText('Masuk ke akun Anda')).toBeInTheDocument()

    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')

    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('disables the form while the request is in flight (AC-001a-12)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    render(<LoginPage />)
    fillAndSubmit()

    expect(await screen.findByRole('button', { name: 'Memproses…' })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
  })

  it('sends the credentials to the API with the cookie enabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ user: {} }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<LoginPage />)
    fillAndSubmit()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_URL}/auth/login`)
    expect(init.credentials).toBe('include')
    expect(init.body).toBe(JSON.stringify({ email: 'admin@oddo.local', password: 'ChangeMe!2026' }))
  })

  it('redirects to the root page once login succeeds (AC-001a-12)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ user: {} }) }),
    )

    render(<LoginPage />)
    fillAndSubmit()

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/')
    })
  })

  /**
   * The message is shown; the code and request id are not. Those belong in the
   * server log, and putting them on a login screen tells an attacker more than
   * it tells the person trying to sign in.
   */
  it('shows only the message from a rejected login (AC-001a-12)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            statusCode: 401,
            code: 'UNAUTHORIZED',
            message: 'Email atau password salah',
            details: [],
            requestId: '01920000-0000-7000-8000-00000000abcd',
            timestamp: '2026-09-16T04:12:33.120Z',
          }),
      }),
    )

    render(<LoginPage />)
    fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email atau password salah')

    expect(screen.queryByText(/UNAUTHORIZED/)).not.toBeInTheDocument()
    expect(screen.queryByText(/01920000-0000-7000-8000-00000000abcd/)).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('re-enables the form after a failure so the user can try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ code: 'UNAUTHORIZED', message: 'Email atau password salah' }),
      }),
    )

    render(<LoginPage />)
    fillAndSubmit()

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeEnabled()
  })

  it('names the unreachable API by its configured URL (AC-001a-12)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<LoginPage />)
    fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(`Tidak dapat menghubungi server di ${API_URL}`)
  })
})
