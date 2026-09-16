import type { HealthResponse } from '@oddo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HealthDashboard } from '@/components/health-dashboard'
import { API_URL } from '@/lib/config'

function healthBody(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    version: '0.1.0',
    uptimeSeconds: 42,
    timestamp: '2026-09-16T04:12:33.120Z',
    checks: {
      database: { status: 'up', latencyMs: 3 },
      redis: { status: 'up', latencyMs: 1 },
    },
    ...overrides,
  }
}

function mockFetchResolving(body: HealthResponse, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status < 400,
      json: () => Promise.resolve(body),
    }),
  )
}

describe('HealthDashboard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows a skeleton while the request is still in flight', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    render(<HealthDashboard />)

    expect(screen.getByTestId('health-loading')).toBeInTheDocument()
    expect(screen.queryByText('Database')).not.toBeInTheDocument()
  })

  it('renders both dependencies as up when the system is healthy', async () => {
    mockFetchResolving(healthBody())

    render(<HealthDashboard />)

    expect(await screen.findByText('Database')).toBeInTheDocument()
    expect(screen.getByText('Redis')).toBeInTheDocument()
    expect(screen.getByText('Versi 0.1.0')).toBeInTheDocument()
    expect(screen.getAllByText('up')).toHaveLength(2)
    expect(screen.getByText('Merespons dalam 3 ms')).toBeInTheDocument()
    expect(screen.getByText(/Status:\s*sehat/)).toBeInTheDocument()
  })

  it('calls the API at the configured URL', async () => {
    mockFetchResolving(healthBody())

    render(<HealthDashboard />)
    await screen.findByText('Database')

    expect(globalThis.fetch).toHaveBeenCalledWith(`${API_URL}/health`, { cache: 'no-store' })
  })

  it('shows which dependency is down when the system is degraded', async () => {
    mockFetchResolving(
      healthBody({
        status: 'degraded',
        checks: {
          database: { status: 'up', latencyMs: 3 },
          redis: { status: 'down', error: 'connection refused' },
        },
      }),
      503,
    )

    render(<HealthDashboard />)

    expect(await screen.findByText('down')).toBeInTheDocument()
    expect(screen.getByText('up')).toBeInTheDocument()
    expect(screen.getByText('connection refused')).toBeInTheDocument()
    expect(screen.getByText(/Status:\s*terdegradasi/)).toBeInTheDocument()
  })

  it('reports an unreachable API with its URL and a retry button (AC-000-11)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<HealthDashboard />)

    const message = await screen.findByText(/API tidak dapat dihubungi di/)
    expect(message).toHaveTextContent(API_URL)
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
    expect(screen.queryByText(/at Object/)).not.toBeInTheDocument()
  })

  it('retries the request when "Coba lagi" is clicked', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(healthBody()) })
    vi.stubGlobal('fetch', fetchMock)

    render(<HealthDashboard />)

    const retry = await screen.findByRole('button', { name: 'Coba lagi' })
    retry.click()

    await waitFor(() => {
      expect(screen.getByText('Database')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
