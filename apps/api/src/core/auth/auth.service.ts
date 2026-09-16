import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { User } from '@prisma/client'

import { PrismaService } from '../../common/prisma/prisma.service'
import { PasswordService } from './password.service'
import { SessionService, type ActiveSession } from './session.service'

/**
 * BR-AUTH-002: unknown email, wrong password and deactivated account all end
 * here. One message, one code, one status — otherwise the login form becomes a
 * tool for discovering which emails exist in this system.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Email atau password salah'

export interface LoginResult {
  user: User
  session: ActiveSession
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Neither of these paths has a password to check, so neither would reach
    // argon2 on its own — and answering in a millisecond instead of a hundred
    // is itself an answer: it says this address has no account here
    // (BR-AUTH-009). The dummy verification buys back the time.
    if (user === null || !user.active) {
      await this.passwords.verifyDummy()
      this.rejectLogin(normalizedEmail)
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      this.rejectLogin(normalizedEmail)
    }

    const session = await this.sessions.create(user.id, user.companyId)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    this.logger.log(
      { event: 'auth.login.success', userId: user.id, companyId: user.companyId },
      'Login succeeded',
    )

    return { user, session }
  }

  /**
   * BR-AUTH-002: every failed login leaves through here, so the three cases
   * cannot drift apart later. The reason is recorded but never returned —
   * operators need to tell them apart, callers must not (§12.1).
   */
  private rejectLogin(email: string): never {
    this.logger.warn({ event: 'auth.login.failed', email }, 'Login attempt rejected')
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)
  }

  /** Always succeeds, by design: a logout button must never fail (PRD-001a §9). */
  async logout(sid: string | undefined): Promise<void> {
    if (sid === undefined) {
      return
    }

    const userId = await this.sessions.destroy(sid)
    this.logger.log({ event: 'auth.logout', userId }, 'Logout')
  }

  /**
   * Reads Postgres so `name` and `email` are current rather than whatever they
   * were when the session started. This is the one endpoint that pays that cost.
   */
  async findActor(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user === null) {
      // Users are never deleted, so this should be unreachable — but a stale
      // session must produce a 404, not a 500 (PRD-001a §9).
      throw new NotFoundException('User tidak ditemukan')
    }
    return user
  }
}
