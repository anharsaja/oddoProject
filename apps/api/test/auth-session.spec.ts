import { ErrorCode } from '@oddo/shared'
import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import request from 'supertest'

import { SESSION_COOKIE_NAME } from '../src/core/auth/session.cookie'
import { sessionKey, userSessionsKey } from '../src/core/auth/session.service'
import {
  createAuthTestApp,
  seedForAuth,
  sessionCookie,
  setCookieHeaders,
  sidFrom,
  type AdminFixture,
  type AuthTestContext,
} from './auth-helpers'

const IDLE_TTL_SECONDS = 120 * 60
const ABSOLUTE_TTL_MS = 8 * 3_600 * 1_000

describe('session lifecycle', () => {
  let context: AuthTestContext
  let prisma: PrismaClient
  let redis: Redis
  let admin: AdminFixture
  let adminId: string

  beforeAll(async () => {
    context = await createAuthTestApp()
    prisma = context.prisma
    redis = context.redis
    admin = await seedForAuth(prisma)
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).id
  })

  afterAll(async () => {
    await context.close()
  })

  async function login(): Promise<string> {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200)
    return sessionCookie(response)
  }

  /** Rewrites createdAt while leaving the TTL Redis already holds untouched. */
  async function backdateSession(sid: string, millisecondsAgo: number): Promise<void> {
    const raw = await redis.get(sessionKey(sid))
    const payload = JSON.parse(raw ?? '{}') as Record<string, unknown>
    payload['createdAt'] = new Date(Date.now() - millisecondsAgo).toISOString()
    await redis.set(sessionKey(sid), JSON.stringify(payload), 'KEEPTTL')
  }

  it('identifies the owner of the cookie (AC-001a-05)', async () => {
    const cookie = await login()
    const loggedInAt = Date.now()

    const response = await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    const body = response.body as Record<string, unknown>
    expect(body['email']).toBe(admin.email)
    expect(body['id']).toBe(adminId)

    const session = body['session'] as Record<string, string>
    const absolute = Date.parse(session['absoluteExpiresAt'] ?? '')
    expect(Math.abs(absolute - (loggedInAt + ABSOLUTE_TTL_MS))).toBeLessThan(10_000)
  })

  it('refuses a request with no cookie at all (AC-001a-05)', async () => {
    const response = await request(context.app.getHttpServer()).get('/api/auth/me').expect(401)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.UNAUTHORIZED)
  })

  it('refuses an unknown session id and takes the cookie back (§11 no. 3)', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=this-session-never-existed`)
      .expect(401)

    const cleared = setCookieHeaders(response).find((value) =>
      value.startsWith(`${SESSION_COOKIE_NAME}=`),
    )
    expect(cleared).toContain('Max-Age=0')
  })

  it('slides the idle window forward on every request (AC-001a-06)', async () => {
    const cookie = await login()
    const sid = sidFrom(cookie)

    await redis.expire(sessionKey(sid), 60)
    await expect(redis.ttl(sessionKey(sid))).resolves.toBeLessThanOrEqual(60)

    await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    const ttl = await redis.ttl(sessionKey(sid))
    expect(ttl).toBeGreaterThan(IDLE_TTL_SECONDS - 10)
    expect(ttl).toBeLessThanOrEqual(IDLE_TTL_SECONDS)
  })

  it('never slides past the absolute ceiling (AC-001a-07)', async () => {
    const cookie = await login()
    const sid = sidFrom(cookie)

    // 7h59m old: still valid, but only about a minute of absolute life is left.
    await backdateSession(sid, 7 * 3_600_000 + 59 * 60_000)

    await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    const ttl = await redis.ttl(sessionKey(sid))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })

  it('destroys a session that has passed the ceiling, not merely refuses it (AC-001a-07)', async () => {
    const cookie = await login()
    const sid = sidFrom(cookie)

    await backdateSession(sid, 8 * 3_600_000 + 60_000)

    const response = await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.UNAUTHORIZED)
    await expect(redis.exists(sessionKey(sid))).resolves.toBe(0)
    await expect(redis.sismember(userSessionsKey(adminId), sid)).resolves.toBe(0)
  })

  it('kills the session on the server when logging out (AC-001a-08)', async () => {
    const cookie = await login()
    const sid = sidFrom(cookie)

    const logout = await request(context.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204)

    const cleared = setCookieHeaders(logout).find((value) =>
      value.startsWith(`${SESSION_COOKIE_NAME}=`),
    )
    expect(cleared).toContain('Max-Age=0')

    await expect(redis.exists(sessionKey(sid))).resolves.toBe(0)
    await expect(redis.sismember(userSessionsKey(adminId), sid)).resolves.toBe(0)

    await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401)

    // A logout button must never fail, so doing it twice is still a success.
    await request(context.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204)
  })

  it('answers logout with 204 even with no cookie at all (AC-001a-08)', async () => {
    await request(context.app.getHttpServer()).post('/api/auth/logout').expect(204)
  })

  it('keeps two devices independent (AC-001a-09)', async () => {
    // Start from a known state: earlier tests in this file left sessions behind.
    const leftovers = await redis.smembers(userSessionsKey(adminId))
    if (leftovers.length > 0) {
      await redis.del(...leftovers.map(sessionKey), userSessionsKey(adminId))
    }

    const firstCookie = await login()
    const secondCookie = await login()
    const firstSid = sidFrom(firstCookie)
    const secondSid = sidFrom(secondCookie)

    expect(firstSid).not.toBe(secondSid)
    await expect(redis.smembers(userSessionsKey(adminId))).resolves.toHaveLength(2)

    await request(context.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', firstCookie)
      .expect(204)

    await expect(redis.smembers(userSessionsKey(adminId))).resolves.toEqual([secondSid])

    await request(context.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', secondCookie)
      .expect(200)
  })
})
