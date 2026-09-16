import { Controller, Get, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ErrorCode } from '@oddo/shared'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { getEnv } from '../src/config/env'
import { adminFixture, sessionCookie } from './auth-helpers'

/**
 * Carries no marker of any kind. That is the whole point: BR-AUTH-008 says an
 * endpoint nobody thought about is closed, and the only way to show it is with
 * an endpoint nobody wrote anything on.
 */
@Controller('unmarked-probe')
class UnmarkedProbeController {
  @Get()
  read(): { reached: boolean } {
    return { reached: true }
  }
}

describe('global AuthGuard', () => {
  let app: INestApplication
  let prisma: PrismaClient
  const admin = adminFixture()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [UnmarkedProbeController],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app, getEnv())
    await app.init()

    prisma = new PrismaClient()
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  describe('closed by default (AC-001b-01)', () => {
    it('refuses /api/auth/me without a cookie, in the standard envelope', async () => {
      const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401)

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
    })

    it('refuses an endpoint that was never marked, without a line of code in it', async () => {
      const response = await request(app.getHttpServer()).get('/api/unmarked-probe').expect(401)

      expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.UNAUTHORIZED)
    })

    it('lets the same endpoint through once a session is presented', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200)

      await request(app.getHttpServer())
        .get('/api/unmarked-probe')
        .set('Cookie', sessionCookie(login))
        .expect(200)

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', sessionCookie(login))
        .expect(200)
    })
  })

  describe('public endpoints stay open (AC-001b-02)', () => {
    it('serves the health check without a cookie', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200)
    })

    it('serves login without a cookie — logging in cannot require being logged in', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200)

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: 'wrong' })
        .expect(401)
    })

    it('serves logout without a cookie', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204)
    })

    it('answers an unknown route with 404, not 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/tidak-ada').expect(404)

      expect((response.body as Record<string, unknown>)['code']).toBe(ErrorCode.NOT_FOUND)
    })
  })
})
