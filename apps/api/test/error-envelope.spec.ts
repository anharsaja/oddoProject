import { Body, Controller, type INestApplication, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ErrorCode } from '@oddo/shared'
import { IsString } from 'class-validator'
import request from 'supertest'

import { Public } from '../src/common/decorators/public.decorator'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { getEnv } from '../src/config/env'

class ProbeDto {
  @IsString()
  name!: string
}

/**
 * Exists only inside this test file (PRD-000 §15): the production API has no
 * endpoint that accepts a body yet, and adding one just to be validated would
 * be a feature nobody asked for.
 *
 * Marked @Public() since PRD-001b closed the API by default. This probe is here
 * to exercise the ValidationPipe and the error envelope; without the marker it
 * would answer 401 and stop testing either of them. The closed-by-default
 * behaviour has its own probe, in auth-guard.spec.ts.
 */
@Controller('validation-probe')
class ValidationProbeController {
  @Post()
  @Public()
  create(@Body() dto: ProbeDto): { received: string } {
    return { received: dto.name }
  }
}

const ENVELOPE_FIELDS = ['code', 'details', 'message', 'requestId', 'statusCode', 'timestamp']

describe('standard error envelope (ADR-0001 B8)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationProbeController],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app, getEnv())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers an unknown route with 404 in the standard shape (AC-000-05)', async () => {
    const response = await request(app.getHttpServer()).get('/api/tidak-ada').expect(404)
    const body = response.body as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(ENVELOPE_FIELDS)
    expect(body['statusCode']).toBe(404)
    expect(body['code']).toBe(ErrorCode.NOT_FOUND)
    expect(body['message']).toBe('Cannot GET /api/tidak-ada')
    expect(body['details']).toEqual([])
    expect(typeof body['requestId']).toBe('string')
    expect(body['requestId']).not.toBe('')
    expect(Number.isNaN(Date.parse(String(body['timestamp'])))).toBe(false)
  })

  it('uses the same request id in the body and in the response header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/tidak-ada')
      .set('x-request-id', 'traceable-id')
      .expect(404)

    expect((response.body as Record<string, unknown>)['requestId']).toBe('traceable-id')
    expect(response.headers['x-request-id']).toBe('traceable-id')
  })

  it('rejects a body carrying an undeclared field (AC-000-06, BR-INFRA-003)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/validation-probe')
      .send({ name: 'a', unknownField: 1 })
      .expect(400)

    const body = response.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(ENVELOPE_FIELDS)
    expect(body['code']).toBe(ErrorCode.VALIDATION_ERROR)

    const details = body['details'] as Array<{ field: string; issue: string }>
    expect(details.some((detail) => detail.field === 'unknownField')).toBe(true)
    expect(JSON.stringify(details)).toContain('unknownField')
  })

  it('reports a field that fails its own constraint', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/validation-probe')
      .send({ name: 42 })
      .expect(400)

    const details = (response.body as Record<string, unknown>)['details'] as Array<{
      field: string
      issue: string
    }>
    expect(details.some((detail) => detail.field === 'name')).toBe(true)
  })

  it('accepts a body that declares exactly the expected fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/validation-probe')
      .send({ name: 'ada' })
      .expect(201)

    expect(response.body).toEqual({ received: 'ada' })
  })
})
