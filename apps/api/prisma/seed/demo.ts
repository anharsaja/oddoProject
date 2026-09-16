import { PrismaClient } from '@prisma/client'

/**
 * Demo seed (ADR-0001 B10): sample data for development only. Never run in
 * production.
 *
 * Empty in PRD-000 — there is no business data yet. The file exists so the
 * next PRD has an obvious place to put its fixtures instead of inventing one.
 */
export async function seedDemo(_prisma: PrismaClient): Promise<void> {
  // Intentionally empty until the first business tables land (PRD-002+).
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await seedDemo(prisma)
    console.log('seed/demo: ok (nothing to seed yet)')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('seed/demo: failed', error)
    process.exit(1)
  })
}
