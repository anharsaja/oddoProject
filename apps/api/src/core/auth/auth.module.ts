import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { SessionService } from './session.service'

/**
 * ADR-0004 channel 2: AuthGuard needs SessionService and Reflector injected, so
 * it is registered as a provider rather than constructed with `new` in main.ts.
 * Registering it as APP_GUARD is also what makes it visible to the integration
 * tests without any of them having to remember to install it.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PasswordService,
    SessionService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard, SessionService, PasswordService],
})
export class AuthModule {}
