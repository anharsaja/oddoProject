import { ErrorCode } from '@oddo/shared'
import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import request from 'supertest'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_COMPANY_ID } from '../prisma/seed/system'
import { PasswordService } from '../src/core/auth/password.service'
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

const INACTIVE_EMAIL = 'inactive@oddo.local'
const INACTIVE_PASSWORD = 'AlsoValid!2026'

describe('POST /api/auth/login', () => {
  let context: AuthTestContext
  let prisma: PrismaClient
  let redis: Redis
  let admin: AdminFixture

  beforeAll(async () => {
    context = await createAuthTestApp()
    prisma = context.prisma
    redis = context.redis
    admin = await seedForAuth(prisma)

    // AC-001a-03 needs a real deactivated account with a real, correct password.
    await prisma.user.create({
      data: {
        id: uuidv7(),
        companyId: DEFAULT_COMPANY_ID,
        email: INACTIVE_EMAIL,
        passwordHash: await new PasswordService().hash(INACTIVE_PASSWORD),
        name: 'Deactivated Person',
        active: false,
      },
    })
  })

  afterAll(async () => {
    await context.close()
  })

  it('accepts the seeded administrator and sets a session cookie (AC-001a-01)', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200)

    const body = response.body as Record<string, Record<string, unknown>>

    expect(body['user']?.['email']).toBe(admin.email)
    expect(body['user']?.['companyId']).toBe(DEFAULT_COMPANY_ID)
    expect(body['user']?.['isSuperadmin']).toBe(true)
    expect(body['user']?.['name']).toBe('Administrator')

    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain('passwordHash')
    expect(serialised).not.toContain('password_hash')
    expect(serialised).not.toContain(sidFrom(sessionCookie(response)))

    const cookie = setCookieHeaders(response).find((value) =>
      value.startsWith(`${SESSION_COOKIE_NAME}=`),
    )
    expect(cookie).toBeDefined()
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('normalises the email before looking it up (§11 no. 9)', async () => {
    await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email.toUpperCase(), password: admin.password })
      .expect(200)
  })

  it('records the session and its index entry in Redis (AC-001a-02)', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200)

    const sid = sidFrom(sessionCookie(response))
    const stored = await redis.get(sessionKey(sid))
    expect(stored).not.toBeNull()

    const payload = JSON.parse(stored ?? '{}') as Record<string, unknown>
    const user = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })
    expect(payload['userId']).toBe(user.id)
    expect(payload['companyId']).toBe(DEFAULT_COMPANY_ID)
    expect(typeof payload['createdAt']).toBe('string')

    const ttl = await redis.ttl(sessionKey(sid))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(120 * 60)

    await expect(redis.sismember(userSessionsKey(user.id), sid)).resolves.toBe(1)
  })

  it('updates last_login_at', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })

    await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200)

    const after = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })
    expect(after.lastLoginAt).not.toBeNull()
    expect(after.lastLoginAt?.getTime() ?? 0).toBeGreaterThanOrEqual(
      before.lastLoginAt?.getTime() ?? 0,
    )
  })

  /**
   * Compared as three whole bodies rather than three separate assertions against
   * an expected string: the requirement is that they are indistinguishable from
   * each other, which is a different claim from each one matching a constant.
   */
  it('answers unknown email, wrong password and deactivated user identically (AC-001a-03)', async () => {
    const attempts = [
      { email: 'nobody@oddo.local', password: admin.password },
      { email: admin.email, password: 'definitely-not-the-password' },
      { email: INACTIVE_EMAIL, password: INACTIVE_PASSWORD },
    ]

    const responses = await Promise.all(
      attempts.map((attempt) =>
        request(context.app.getHttpServer()).post('/api/auth/login').send(attempt).expect(401),
      ),
    )

    const comparable = responses.map((response) => {
      const body = response.body as Record<string, unknown>
      return JSON.stringify({
        statusCode: body['statusCode'],
        code: body['code'],
        message: body['message'],
        details: body['details'],
      })
    })

    expect(comparable[1]).toBe(comparable[0])
    expect(comparable[2]).toBe(comparable[0])

    for (const response of responses) {
      expect(setCookieHeaders(response)).toHaveLength(0)
    }
  })

  it('keeps the standard error envelope on a failed login (AC-001a-04)', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'definitely-not-the-password' })
      .expect(401)

    const body = response.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'code',
      'details',
      'message',
      'requestId',
      'statusCode',
      'timestamp',
    ])
    expect(body['code']).toBe(ErrorCode.UNAUTHORIZED)
    expect(body['statusCode']).toBe(401)
  })

  it('rejects an empty password as a malformed request, not a wrong one (§11 no. 11)', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: '' })
      .expect(400)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.VALIDATION_ERROR)
  })

  it('rejects a body carrying an undeclared field (§11 no. 10)', async () => {
    await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password, rememberMe: true })
      .expect(400)
  })
})
