import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { RequestAuth, RequestWithAuth } from '../context/request-context'

/**
 * Hands a controller the caller established by AuthGuard.
 *
 * Only meaningful behind a guard: on an unguarded route there is nobody to
 * return, and the value is `undefined`. Routes that need a user say so with
 * `@UseGuards(AuthGuard)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestAuth | undefined =>
    context.switchToHttp().getRequest<RequestWithAuth>().auth,
)
