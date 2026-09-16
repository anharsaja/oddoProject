import type { HealthCheckResult, HealthStatus } from '@oddo/shared'

/**
 * The instance is "ok" only when every dependency answered. One dependency
 * down is enough to make the whole instance degraded — a half-working ERP is
 * not something monitoring should report as healthy.
 */
export function resolveOverallStatus(
  checks: Readonly<Record<string, HealthCheckResult>>,
): HealthStatus {
  const results = Object.values(checks)
  return results.every((check) => check.status === 'up') ? 'ok' : 'degraded'
}
