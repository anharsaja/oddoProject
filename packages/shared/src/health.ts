/** Overall verdict for the instance. */
export type HealthStatus = 'ok' | 'degraded'

/** Verdict for a single dependency. */
export type DependencyStatus = 'up' | 'down'

/**
 * Result of probing one dependency.
 *
 * `latencyMs` is present when the probe answered, `error` when it did not.
 * They are mutually exclusive in practice, but kept as two optional fields so
 * the JSON stays flat and easy to read in a monitoring dashboard.
 */
export interface HealthCheckResult {
  status: DependencyStatus
  latencyMs?: number
  error?: string
}

/**
 * Body of `GET /api/health` — see PRD-000 §9.
 *
 * Deliberately NOT the standard error envelope (ADR-0001 B8), even on 503:
 * a failing health check means "the system is sick", not "your request was
 * wrong", and monitoring needs to see *which* dependency went down.
 */
export interface HealthResponse {
  status: HealthStatus
  version: string
  uptimeSeconds: number
  timestamp: string
  checks: {
    database: HealthCheckResult
    redis: HealthCheckResult
  }
}
