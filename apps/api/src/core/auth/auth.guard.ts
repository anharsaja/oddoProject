import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'

import type { RequestAuth } from '../../common/context/request-context'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { ENV } from '../../config/env.module'
import type { Env } from '../../config/env.schema'
import { clearSessionCookie, readSessionCookie } from './session.cookie'
import { SessionService, type ActiveSession } from './session.service'

export const UNAUTHENTICATED_MESSAGE = 'Sesi tidak valid atau sudah berakhir'

/** The request as it looks once this guard has run. */
export interface RequestWithSession extends Request {
  auth?: RequestAuth
  authSession?: ActiveSession
}

/**
 * The application's only security boundary (BR-AUTH-010).
 *
 * Registered globally as APP_GUARD, so an endpoint is closed unless it says
 * otherwise with `@Public()` — ADR-0002 §3: forgetting to add a guard must never
 * be the thing that leaves an endpoint open.
 *
 * Reads Redis, never Postgres. Checking `user.active` here would mean one
 * database query on every request of the whole application, forever.
 * Deactivation still takes effect immediately — PRD-002 deletes that user's
 * sessions through the `user:<id>:sessions` index at the moment of
 * deactivation. The work is done once, when it happens, instead of millions of
 * times just in case.
 *
 * A Redis failure propagates as a 500. Turning it into a 401 would tell every
 * logged-in user that their credentials are wrong (ADR-0001 B8 amendment).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name)

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler first, then class: a controller may be public as a whole while a
    // single route inside it is not, and the closest marker should win.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic === true) {
      return true
    }

    const http = context.switchToHttp()
    const request = http.getRequest<RequestWithSession>()
    const response = http.getResponse<Response>()

    const sid = readSessionCookie(request.cookies)
    if (sid === undefined) {
      this.reject(request)
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE)
    }

    const session = await this.sessions.read(sid)
    if (session === null) {
      // The browser is holding a cookie that means nothing; take it back so it
      // stops being sent (PRD-001a §11 no. 3).
      clearSessionCookie(response, this.env)
      this.reject(request)
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE)
    }

    request.auth = { userId: session.userId, companyId: session.companyId }
    request.authSession = session
    return true
  }

  /**
   * Logged at debug, not warn: once the application is closed, requests without
   * a session are an everyday event — monitoring, stale tabs, bots — and they
   * do not deserve to flood the level the test environment runs at (§12.1).
   */
  private reject(request: RequestWithSession): void {
    this.logger.debug(
      {
        event: 'auth.request.unauthenticated',
        path: request.originalUrl,
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
      'Request rejected without a valid session',
    )
  }
}
