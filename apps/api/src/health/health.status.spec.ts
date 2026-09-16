import type { HealthCheckResult } from '@oddo/shared'

import { resolveOverallStatus } from './health.status'

const up: HealthCheckResult = { status: 'up', latencyMs: 1 }
const down: HealthCheckResult = { status: 'down', error: 'connection refused' }

describe('resolveOverallStatus', () => {
  it('is ok when every dependency answered', () => {
    expect(resolveOverallStatus({ database: up, redis: up })).toBe('ok')
  })

  it('is degraded when one dependency is down', () => {
    expect(resolveOverallStatus({ database: up, redis: down })).toBe('degraded')
    expect(resolveOverallStatus({ database: down, redis: up })).toBe('degraded')
  })

  it('is degraded when every dependency is down', () => {
    expect(resolveOverallStatus({ database: down, redis: down })).toBe('degraded')
  })

  it('is ok when there is nothing to check', () => {
    expect(resolveOverallStatus({})).toBe('ok')
  })
})
