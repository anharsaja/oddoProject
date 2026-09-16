import { resolveSessionTtl, type SessionTtlPolicy } from './session-ttl'

const policy: SessionTtlPolicy = {
  idleTtlSeconds: 120 * 60,
  absoluteTtlSeconds: 8 * 3_600,
}

const createdAt = new Date('2026-09-16T00:00:00.000Z')

function minutesAfterCreation(minutes: number): Date {
  return new Date(createdAt.getTime() + minutes * 60_000)
}

describe('resolveSessionTtl', () => {
  it('gives the full idle window while the absolute ceiling is far away', () => {
    const decision = resolveSessionTtl(createdAt, minutesAfterCreation(10), policy)

    expect(decision.expired).toBe(false)
    expect(decision.ttlSeconds).toBe(policy.idleTtlSeconds)
    expect(decision.absoluteExpiresAt.toISOString()).toBe('2026-09-16T08:00:00.000Z')
  })

  it('shortens the window to whatever is left of the absolute ceiling', () => {
    // 7h59m in: one minute of absolute life remains, far less than the idle window.
    const decision = resolveSessionTtl(createdAt, minutesAfterCreation(479), policy)

    expect(decision.expired).toBe(false)
    expect(decision.ttlSeconds).toBe(60)
    expect(decision.idleExpiresAt.toISOString()).toBe('2026-09-16T08:00:00.000Z')
  })

  it('reports a session past its ceiling as expired, with no TTL to write back', () => {
    const decision = resolveSessionTtl(createdAt, minutesAfterCreation(481), policy)

    expect(decision.expired).toBe(true)
    expect(decision.ttlSeconds).toBe(0)
  })

  it('treats the exact moment of the ceiling as expired', () => {
    const decision = resolveSessionTtl(createdAt, minutesAfterCreation(480), policy)

    expect(decision.expired).toBe(true)
  })

  it('never returns a TTL longer than the idle window, however young the session', () => {
    const decision = resolveSessionTtl(createdAt, createdAt, policy)

    expect(decision.ttlSeconds).toBe(policy.idleTtlSeconds)
    expect(decision.ttlSeconds).toBeLessThan(policy.absoluteTtlSeconds)
  })
})
