import { Module } from '@nestjs/common'

import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { SessionService } from './session.service'

/**
 * ADR-0004 channel 2 is where AuthGuard will be registered as APP_GUARD — but
 * that happens in PRD-001b. Here the guard is a plain provider, applied locally
 * with `@UseGuards` on the one route that needs it, so this PRD does not change
 * the behaviour of every existing endpoint at once.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PasswordService, SessionService],
  exports: [AuthGuard, SessionService, PasswordService],
})
export class AuthModule {}
