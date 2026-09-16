import { PrismaClient } from '@prisma/client'
import { v7 as uuidv7 } from 'uuid'

import { APP_INITIALIZED_AT_KEY, APP_VERSION_KEY } from '../../src/common/system-setting.keys'
import { getEnv } from '../../src/config/env'
import { PasswordService } from '../../src/core/auth/password.service'

/**
 * Schema version of this application. Read back by GET /api/health, which is
 * how the health endpoint proves that migrate, seed and the Prisma client all
 * work — not merely that a TCP socket is open.
 */
export const APP_VERSION = '0.1.0'

/**
 * Fixed on purpose (PRD-001a §2.4): a UUID v7 minted once and written down,
 * never generated per run. Because the id is constant, the seed can upsert by
 * it and every environment ends up with the same company id.
 */
export const DEFAULT_COMPANY_ID = '01920000-0000-7000-8000-000000000001'
export const DEFAULT_COMPANY_NAME = 'Default Company'
export const ADMIN_NAME = 'Administrator'

export interface AdminCredentials {
  adminEmail: string
  adminPassword: string
}

/** Settings that must exist in every environment. Idempotent. */
async function seedSystemSettings(prisma: PrismaClient): Promise<void> {
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

/**
 * The default company and the first administrator, created together.
 *
 * Both upserts use `update: {}` — the seed is create-only (BR-AUTH-005). Re-running
 * it after someone has changed the admin password must not quietly reset that
 * password back to whatever ADMIN_PASSWORD currently says.
 *
 * One transaction, because `user.company_id` is NOT NULL: an instance that ends up
 * with a company but no administrator is an instance nobody can log into.
 */
export async function seedCompanyAndAdmin(
  prisma: PrismaClient,
  credentials: AdminCredentials,
): Promise<void> {
  // Hashing is deliberately slow, so it happens before the transaction opens
  // rather than holding a database transaction for the duration.
  const passwordHash = await new PasswordService().hash(credentials.adminPassword)

  await prisma.$transaction(async (tx) => {
    await tx.company.upsert({
      where: { id: DEFAULT_COMPANY_ID },
      update: {},
      create: { id: DEFAULT_COMPANY_ID, name: DEFAULT_COMPANY_NAME },
    })

    await tx.user.upsert({
      where: { email: credentials.adminEmail },
      update: {},
      create: {
        id: uuidv7(),
        companyId: DEFAULT_COMPANY_ID,
        email: credentials.adminEmail,
        passwordHash,
        name: ADMIN_NAME,
        isSuperadmin: true,
        active: true,
        // created_by stays NULL: nobody created this account, the system did.
      },
    })
  })
}

/**
 * System seed (ADR-0001 B10): data that must exist in every environment,
 * including production. Idempotent — running it twice changes nothing.
 */
export async function seedSystem(
  prisma: PrismaClient,
  credentials?: AdminCredentials,
): Promise<void> {
  const env = getEnv()
  const resolved: AdminCredentials = credentials ?? {
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
  }

  await seedSystemSettings(prisma)
  await seedCompanyAndAdmin(prisma, resolved)
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
