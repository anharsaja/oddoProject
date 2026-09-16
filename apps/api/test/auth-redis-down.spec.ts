import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ErrorCode } from '@oddo/shared'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { ENV } from '../src/config/env.module'
import { getEnv } from '../src/config/env'
import { SESSION_COOKIE_NAME } from '../src/core/auth/session.cookie'
import { adminFixture } from './auth-helpers'

/** Nothing listens here — the PRD-000 pattern, rather than stopping a container. */
const DEAD_REDIS_URL = 'redis://localhost:6399/1'

/**
 * PRD-001a §11 no. 1 and 2. An unreachable Redis is an outage, and an outage
 * must not be reported as "your credentials are wrong": every logged-in user
 * would be told they had been signed out, and every operator would go looking
 * at the wrong thing.
 */
describe('auth when Redis is unreachable', () => {
  let app: INestApplication
  let prisma: PrismaClient
  const admin = adminFixture()

  beforeAll(async () => {
    // Postgres is healthy here, so the account genuinely exists and the password
    // genuinely matches. Only the session store is broken.
    prisma = new PrismaClient()
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })

    const env = { ...getEnv(), REDIS_URL: DEAD_REDIS_URL }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(env)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app, env)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  it('answers 500 on login, not 401 (§11 no. 1)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(500)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('answers 500 on a cookie-bearing request, not 401 (§11 no. 2)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=any-session-id-at-all`)
      .expect(500)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('still answers a request with no cookie as 401 — that one really is unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401)

    expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.UNAUTHORIZED)
  })

  it('keeps the health endpoint reporting the outage rather than hiding it', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(503)

    const body = response.body as { checks: Record<string, { status: string }> }
    expect(body.checks['redis']?.status).toBe('down')
  })
})
