import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import type { Response } from 'supertest'

import { seedSystem } from '../prisma/seed/system'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { SESSION_COOKIE_NAME } from '../src/core/auth/session.cookie'
import { getEnv } from '../src/config/env'
import type { Env } from '../src/config/env.schema'

export interface AuthTestContext {
  app: INestApplication
  prisma: PrismaClient
  redis: Redis
  close: () => Promise<void>
}

/**
 * Boots the application exactly the way production does — through
 * `configureApp` (ADR-0004). A test that assembles its own wiring proves the
 * wiring it invented works, not the wiring that ships.
 */
export async function createAuthTestApp(
  customise?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
  env: Env = getEnv(),
): Promise<AuthTestContext> {
  const base = Test.createTestingModule({ imports: [AppModule] })
  const moduleRef = await (customise ? customise(base) : base).compile()

  const app = moduleRef.createNestApplication()
  configureApp(app, env)
  await app.init()

  const prisma = new PrismaClient()
  const redis = new Redis(env.REDIS_URL)

  return {
    app,
    prisma,
    redis,
    close: async () => {
      await app.close()
      await prisma.$disconnect()
      redis.disconnect()
    },
  }
}

export interface AdminFixture {
  email: string
  password: string
}

/** Credentials the system seed will have created, taken from .env.test. */
export function adminFixture(): AdminFixture {
  const env = getEnv()
  return { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }
}

export async function seedForAuth(prisma: PrismaClient): Promise<AdminFixture> {
  const fixture = adminFixture()
  await seedSystem(prisma, { adminEmail: fixture.email, adminPassword: fixture.password })
  return fixture
}

/** The raw `oddo_session=...` pair, ready to be sent back as a Cookie header. */
export function sessionCookie(response: Response): string {
  const header = response.headers['set-cookie']
  const cookies: string[] = Array.isArray(header) ? header : header === undefined ? [] : [header]
  const match = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))

  if (match === undefined) {
    throw new Error('response carried no session cookie')
  }
  return match.split(';')[0] ?? ''
}

export function sidFrom(cookie: string): string {
  return cookie.slice(`${SESSION_COOKIE_NAME}=`.length)
}

export function setCookieHeaders(response: Response): string[] {
  const header = response.headers['set-cookie']
  return Array.isArray(header) ? header : header === undefined ? [] : [header]
}
