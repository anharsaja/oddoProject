/** Session policy in seconds, derived from the two env vars in PRD-001a §2.4. */
export interface SessionTtlPolicy {
  idleTtlSeconds: number
  absoluteTtlSeconds: number
}

export interface SessionTtlDecision {
  /** True once the absolute ceiling has been passed; the session must be destroyed. */
  expired: boolean
  /** TTL to write back to Redis now. Zero when expired. */
  ttlSeconds: number
  idleExpiresAt: Date
  absoluteExpiresAt: Date
}

/**
 * BR-AUTH-003: the sliding window never pushes a session past its absolute
 * ceiling. Kept as a pure function so the absolute-limit tests can set a
 * `createdAt` explicitly instead of waiting eight hours for a wall clock.
 */
export function resolveSessionTtl(
  createdAt: Date,
  now: Date,
  policy: SessionTtlPolicy,
): SessionTtlDecision {
  const absoluteExpiresAt = new Date(createdAt.getTime() + policy.absoluteTtlSeconds * 1_000)
  const secondsLeftOfAbsolute = Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1_000)

  if (secondsLeftOfAbsolute <= 0) {
    return {
      expired: true,
      ttlSeconds: 0,
      idleExpiresAt: now,
      absoluteExpiresAt,
    }
  }

  const ttlSeconds = Math.min(policy.idleTtlSeconds, secondsLeftOfAbsolute)

  return {
    expired: false,
    ttlSeconds,
    idleExpiresAt: new Date(now.getTime() + ttlSeconds * 1_000),
    absoluteExpiresAt,
  }
}
