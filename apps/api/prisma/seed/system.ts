import { PrismaClient } from '@prisma/client'
import { v7 as uuidv7 } from 'uuid'

/**
 * Schema version of this application. Read back by GET /api/health, which is
 * how the health endpoint proves that migrate, seed and the Prisma client all
 * work — not merely that a TCP socket is open.
 */
export const APP_VERSION = '0.1.0'

export const APP_VERSION_KEY = 'app.version'
export const APP_INITIALIZED_AT_KEY = 'app.initialized_at'

/**
 * System seed (ADR-0001 B10): data that must exist in every environment,
 * including production. Idempotent — running it twice changes nothing.
 */
export async function seedSystem(prisma: PrismaClient): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: APP_VERSION_KEY },
    update: { value: APP_VERSION },
    create: {
      id: uuidv7(),
      key: APP_VERSION_KEY,
      value: APP_VERSION,
      description: 'Application schema version',
    },
  })

  // `update: {}` on purpose: this records when the instance was FIRST prepared,
  // so a later re-seed must not move it.
  await prisma.systemSetting.upsert({
    where: { key: APP_INITIALIZED_AT_KEY },
    update: {},
    create: {
      id: uuidv7(),
      key: APP_INITIALIZED_AT_KEY,
      value: new Date().toISOString(),
      description: 'When this instance was first prepared',
    },
  })
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await seedSystem(prisma)
    console.log('seed/system: ok')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('seed/system: failed', error)
    process.exit(1)
  })
}
