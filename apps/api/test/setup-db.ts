import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Empties every application table before each test file (PRD-000 §15).
 *
 * Tables are discovered at runtime instead of being listed, so a PRD that adds
 * a table does not also have to remember to add it here. TRUNCATE rather than
 * `migrate reset` keeps this in the millisecond range.
 */
beforeAll(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `

  if (tables.length === 0) {
    return
  }

  const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
})

afterAll(async () => {
  await prisma.$disconnect()
})
