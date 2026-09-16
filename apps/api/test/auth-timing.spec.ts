import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { getEnv } from '../src/config/env'
import { DUMMY_PASSWORD_HASH, PasswordService } from '../src/core/auth/password.service'
import { adminFixture } from './auth-helpers'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

/**
 * BR-AUTH-009. PRD-001a promised that the three login failures are
 * indistinguishable, and delivered that for the body of the response. The clock
 * still told the truth: an address with no account came back in about a
 * millisecond, one with an account in about a hundred.
 */
describe('login timing (AC-001b-03)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  const admin = adminFixture()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

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

  it('still runs one argon2 verification for an email that does not exist', async () => {
    const verify = jest.spyOn(app.get(PasswordService), 'verify')

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'definitely-nobody@oddo.local', password: 'whatever-at-all' })
      .expect(401)

    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify.mock.calls[0]?.[0]).toBe(DUMMY_PASSWORD_HASH)

    verify.mockRestore()
  })

  it('also runs one for a deactivated account', async () => {
    await prisma.user.update({ where: { email: admin.email }, data: { active: false } })
    const verify = jest.spyOn(app.get(PasswordService), 'verify')

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(401)

    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify.mock.calls[0]?.[0]).toBe(DUMMY_PASSWORD_HASH)

    verify.mockRestore()
    await prisma.user.update({ where: { email: admin.email }, data: { active: true } })
  })

  /**
   * The threshold is deliberately loose. What is being proved is that both paths
   * reach argon2 at all — an unguarded path answers in about a millisecond
   * against roughly a hundred, and no amount of machine noise turns that into
   * "half as fast".
   */
  it('answers an unknown email in the same order of magnitude as a wrong password', async () => {
    const unknown: number[] = []
    const wrongPassword: number[] = []

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const startUnknown = process.hrtime.bigint()
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: `nobody-${String(attempt)}@oddo.local`, password: 'whatever-at-all' })
        .expect(401)
      unknown.push(Number(process.hrtime.bigint() - startUnknown) / 1_000_000)

      const startWrong = process.hrtime.bigint()
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: 'definitely-not-the-password' })
        .expect(401)
      wrongPassword.push(Number(process.hrtime.bigint() - startWrong) / 1_000_000)
    }

    expect(median(unknown)).toBeGreaterThanOrEqual(median(wrongPassword) * 0.5)
  })
})
