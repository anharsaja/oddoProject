import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'

import { DEFAULT_COMPANY_ID } from '../prisma/seed/system'
import {
  SessionService,
  sessionKey,
  userSessionsKey,
} from '../src/core/auth/session.service'
import { createAuthTestApp, seedForAuth, type AuthTestContext } from './auth-helpers'

/**
 * The per-user index exists for PRD-002, which will revoke every session of a
 * user the moment that user is deactivated. Its only reader in this PRD is
 * `listByUser` — without one, nothing would prove the index is written
 * correctly until the feature that depends on it is built.
 */
describe('SessionService session index', () => {
  let context: AuthTestContext
  let prisma: PrismaClient
  let redis: Redis
  let sessions: SessionService
  let userId: string

  beforeAll(async () => {
    context = await createAuthTestApp()
    prisma = context.prisma
    redis = context.redis
    sessions = context.app.get(SessionService)

    const admin = await seedForAuth(prisma)
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).id
  })

  afterAll(async () => {
    await context.close()
  })

  it('lists every live session of a user', async () => {
    const first = await sessions.create(userId, DEFAULT_COMPANY_ID)
    const second = await sessions.create(userId, DEFAULT_COMPANY_ID)

    const listed = await sessions.listByUser(userId)
    expect(listed.sort()).toEqual([first.sid, second.sid].sort())
  })

  /**
   * Redis does not remove a member from a SET when some other key expires, so
   * the index accumulates ids pointing at nothing. Whoever reads it has to
   * sweep (PRD-001a §11 no. 12).
   */
  it('sweeps ids whose session key has already expired', async () => {
    const live = await sessions.create(userId, DEFAULT_COMPANY_ID)
    const dead = await sessions.create(userId, DEFAULT_COMPANY_ID)

    await redis.del(sessionKey(dead.sid))
    await expect(redis.sismember(userSessionsKey(userId), dead.sid)).resolves.toBe(1)

    const listed = await sessions.listByUser(userId)

    expect(listed).toContain(live.sid)
    expect(listed).not.toContain(dead.sid)
    await expect(redis.sismember(userSessionsKey(userId), dead.sid)).resolves.toBe(0)
  })

  it('returns an empty list for a user who has never logged in', async () => {
    await expect(sessions.listByUser('01920000-0000-7000-8000-0000000000ff')).resolves.toEqual([])
  })

  it('drops the session from the index when it is destroyed', async () => {
    const session = await sessions.create(userId, DEFAULT_COMPANY_ID)

    await expect(sessions.destroy(session.sid)).resolves.toBe(userId)

    await expect(redis.sismember(userSessionsKey(userId), session.sid)).resolves.toBe(0)
    await expect(sessions.read(session.sid)).resolves.toBeNull()
  })
})
