import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()
const redis = new Redis(process.env['REDIS_URL'] ?? '', { lazyConnect: true })

/** Key families this project owns in Redis; nothing else on the index is touched. */
const REDIS_KEY_PATTERNS = ['session:*', 'user:*:sessions']

/**
 * Empties every application table and every session key before each test file
 * (PRD-000 §15, extended by PRD-001a §15).
 *
 * Tables are discovered at runtime instead of being listed, so a PRD that adds
 * a table does not also have to remember to add it here. Redis needs the same
 * treatment for a different reason: sessions left behind by an earlier file
 * would be counted by the tests that assert how many sessions a user has.
 */
beforeAll(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `

  if (tables.length > 0) {
    const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  }

  for (const pattern of REDIS_KEY_PATTERNS) {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }
})

afterAll(async () => {
  await prisma.$disconnect()
  redis.disconnect()
})
