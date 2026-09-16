import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { HealthResponse } from '@oddo/shared'
import request from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { ENV } from '../src/config/env.module'
import { getEnv } from '../src/config/env'

/**
 * AC-000-03 (a). Redis is made unreachable by pointing the client at a port
 * nobody listens on — never by stopping the container, because a test that
 * shells out to Docker breaks every other test running beside it.
 */
const DEAD_REDIS_URL = 'redis://localhost:6399/1'

describe('GET /api/health — Redis unreachable', () => {
  let app: INestApplication

  beforeAll(async () => {
    const env = { ...getEnv(), REDIS_URL: DEAD_REDIS_URL }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(env)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app, env)
    await app.init()

    await seedSystem(app.get(PrismaService))
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 503 and names the dependency that is down (AC-000-03)', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(503)
    const body = response.body as HealthResponse

    expect(body.status).toBe('degraded')
    expect(body.checks.redis.status).toBe('down')
    expect(typeof body.checks.redis.error).toBe('string')
    expect(body.checks.redis.error).not.toBe('')
    expect(body.checks.database.status).toBe('up')
    expect(body.version).toBe('0.1.0')
  })

  it('does not wrap the 503 in the standard error envelope (AC-000-03)', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(503)
    const body = response.body as Record<string, unknown>

    expect(body['code']).toBeUndefined()
    expect(body['statusCode']).toBeUndefined()
    expect(body['details']).toBeUndefined()
    expect(Object.keys(body).sort()).toEqual([
      'checks',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ])
  })

  it('keeps serving after a failed probe — the process does not die (AC-000-03)', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(503)
    const second = await request(app.getHttpServer()).get('/api/health').expect(503)

    expect((second.body as HealthResponse).checks.redis.status).toBe('down')
  })

  it('still answers unrelated routes with the standard error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/tidak-ada').expect(404)

    expect((response.body as Record<string, unknown>)['code']).toBe('NOT_FOUND')
  })
})
