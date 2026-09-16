import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import type { RequestAuth } from '../../common/context/request-context'
import { ENV } from '../../config/env.module'
import type { Env } from '../../config/env.schema'
import { AuthGuard, type RequestWithSession } from './auth.guard'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session.cookie'

interface SessionWindow {
  idleExpiresAt: string
  absoluteExpiresAt: string
}

interface ActorResponse {
  id: string
  email: string
  name: string
  companyId: string
  isSuperadmin: boolean
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: ActorResponse; session: SessionWindow }> {
    const { user, session } = await this.auth.login(dto.email, dto.password)

    setSessionCookie(response, this.env, session.sid)

    // The session id goes into the httpOnly cookie and nowhere else — not into
    // this body, not into a log (§12.1).
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        companyId: user.companyId,
        isSuperadmin: user.isSuperadmin,
      },
      session: {
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
    }
  }

  /**
   * Public on purpose: a stale or missing cookie still gets 204. A logout button
   * that can answer 401 is a logout button that can strand someone on a page
   * they cannot leave.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readSessionCookie(request.cookies))
    clearSessionCookie(response, this.env)
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(
    @CurrentUser() actor: RequestAuth,
    @Req() request: RequestWithSession,
  ): Promise<ActorResponse & { session: SessionWindow }> {
    const user = await this.auth.findActor(actor.userId)
    const session = request.authSession

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      isSuperadmin: user.isSuperadmin,
      session: {
        idleExpiresAt: (session?.idleExpiresAt ?? new Date()).toISOString(),
        absoluteExpiresAt: (session?.absoluteExpiresAt ?? new Date()).toISOString(),
      },
    }
  }
}
