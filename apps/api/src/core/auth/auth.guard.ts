import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import type { RequestAuth } from '../../common/context/request-context'
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
 * Reads Redis, never Postgres.
 *
 * Checking `user.active` here would mean one database query on every request of
 * the whole application, forever. Deactivation still takes effect immediately —
 * PRD-002 deletes that user's sessions through the `user:<id>:sessions` index at
 * the moment of deactivation. The work is done once, when it happens, instead of
 * millions of times just in case (PRD-001a §9).
 *
 * A Redis failure propagates as a 500. Turning it into a 401 would tell every
 * logged-in user that their credentials are wrong.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp()
    const request = http.getRequest<RequestWithSession>()
    const response = http.getResponse<Response>()

    const sid = readSessionCookie(request.cookies)
    if (sid === undefined) {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE)
    }

    const session = await this.sessions.read(sid)
    if (session === null) {
      // The browser is holding a cookie that means nothing; take it back so it
      // stops being sent (PRD-001a §11 no. 3).
      clearSessionCookie(response, this.env)
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE)
    }

    request.auth = { userId: session.userId, companyId: session.companyId }
    request.authSession = session
    return true
  }
}
