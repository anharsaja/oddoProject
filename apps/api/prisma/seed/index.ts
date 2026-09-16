import { PrismaClient } from '@prisma/client'

import { seedSystem } from './system'

/**
 * Entry point for `pnpm db:seed` and for `prisma migrate reset`.
 * Only the system seed runs here; demo data is opt-in via `db:seed:demo`.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await seedSystem(prisma)
    console.log('seed: system data is up to date')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('seed: failed', error)
  process.exit(1)
})
