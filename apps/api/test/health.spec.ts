import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { HealthResponse } from '@oddo/shared'
import request from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { REQUEST_ID_HEADER } from '../src/common/request-id'
import { getEnv } from '../src/config/env'
import { APP_VERSION_KEY } from '../src/common/system-setting.keys'

describe('GET /api/health — every dependency alive', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app, getEnv())
    await app.init()

    prisma = app.get(PrismaService)
    await seedSystem(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 200 with both dependencies up (AC-000-02)', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200)
    const body = response.body as HealthResponse

    expect(body.status).toBe('ok')
    expect(body.version).toBe('0.1.0')
    expect(body.checks.database.status).toBe('up')
    expect(body.checks.redis.status).toBe('up')
    expect(typeof body.checks.database.latencyMs).toBe('number')
    expect(typeof body.checks.redis.latencyMs).toBe('number')
    expect(body.checks.database.error).toBeUndefined()
    expect(body.checks.redis.error).toBeUndefined()
  })

  it('reports uptime and a parseable timestamp', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200)
    const body = response.body as HealthResponse

    expect(Number.isInteger(body.uptimeSeconds)).toBe(true)
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false)
  })

  /**
   * The point of AC-000-02 is that `version` proves migrate + seed + Prisma all
   * work. A hardcoded constant would pass a plain equality check, so the row is
   * changed and the endpoint has to follow it.
   */
  it('reads version from system_setting instead of hardcoding it (AC-000-02)', async () => {
    await prisma.systemSetting.update({
      where: { key: APP_VERSION_KEY },
      data: { value: '9.9.9-from-database' },
    })

    const response = await request(app.getHttpServer()).get('/api/health').expect(200)
    expect((response.body as HealthResponse).version).toBe('9.9.9-from-database')

    await prisma.systemSetting.update({
      where: { key: APP_VERSION_KEY },
      data: { value: '0.1.0' },
    })
  })

  it('returns a request id header that matches nothing the client sent', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200)

    expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String))
    expect(response.headers[REQUEST_ID_HEADER]).not.toBe('')
  })

  it('echoes a caller-supplied request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set(REQUEST_ID_HEADER, 'caller-supplied-id')
      .expect(200)

    expect(response.headers[REQUEST_ID_HEADER]).toBe('caller-supplied-id')
  })

  it('reports the database as down when the seed row is missing', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: APP_VERSION_KEY } })

    const response = await request(app.getHttpServer()).get('/api/health').expect(503)
    const body = response.body as HealthResponse

    expect(body.status).toBe('degraded')
    expect(body.checks.database.status).toBe('down')
    expect(body.checks.database.error).toContain(APP_VERSION_KEY)
    expect(body.version).toBe('unknown')

    await seedSystem(prisma)
  })
})
