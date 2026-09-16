import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import type { HealthResponse } from '@oddo/shared'
import type { Response } from 'express'

import { Public } from '../common/decorators/public.decorator'
import { HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Sets the status code by hand instead of throwing ServiceUnavailableException:
   * a thrown exception would be rewritten by AllExceptionsFilter into the
   * standard error envelope, and monitoring would lose the per-dependency
   * breakdown (PRD-000 §9, AC-000-03).
   */
  @Get()
  @Public()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const body = await this.health.check()
    response.status(body.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
    return body
  }
}
