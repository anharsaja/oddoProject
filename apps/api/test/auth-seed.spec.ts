import type { PrismaClient } from '@prisma/client'

import { DEFAULT_COMPANY_ID, seedSystem } from '../prisma/seed/system'
import { PasswordService } from '../src/core/auth/password.service'
import { adminFixture, createAuthTestApp, type AuthTestContext } from './auth-helpers'

const MARKER_HASH = '$argon2id$marker-placed-by-the-test'

describe('system seed', () => {
  let context: AuthTestContext
  let prisma: PrismaClient

  beforeAll(async () => {
    context = await createAuthTestApp()
    prisma = context.prisma
  })

  afterAll(async () => {
    await context.close()
  })

  it('creates the default company and the administrator together', async () => {
    const admin = adminFixture()
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })

    const company = await prisma.company.findUniqueOrThrow({ where: { id: DEFAULT_COMPANY_ID } })
    expect(company.name).toBe('Default Company')

    const user = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })
    expect(user.companyId).toBe(DEFAULT_COMPANY_ID)
    expect(user.isSuperadmin).toBe(true)
    expect(user.active).toBe(true)
    expect(user.name).toBe('Administrator')
    // NULL means "created by the system seed" — the first admin has no creator.
    expect(user.createdById).toBeNull()
    await expect(new PasswordService().verify(user.passwordHash, admin.password)).resolves.toBe(
      true,
    )
  })

  /**
   * The point of BR-AUTH-005: whoever changed the admin password did so on
   * purpose, and a re-seed that quietly reverts it hands the account back to
   * whatever ADMIN_PASSWORD happens to say today.
   */
  it('never rewrites an existing administrator (AC-001a-10)', async () => {
    const admin = adminFixture()
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })

    await prisma.user.update({
      where: { email: admin.email },
      data: { passwordHash: MARKER_HASH },
    })
    const countBefore = await prisma.user.count()

    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: 'A-Completely-New-Password' })

    const after = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })
    expect(after.passwordHash).toBe(MARKER_HASH)
    await expect(prisma.user.count()).resolves.toBe(countBefore)
  })

  it('is idempotent for the company row as well', async () => {
    const admin = adminFixture()
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })
    await seedSystem(prisma, { adminEmail: admin.email, adminPassword: admin.password })

    await expect(prisma.company.count()).resolves.toBe(1)
  })
})
