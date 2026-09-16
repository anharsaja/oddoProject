import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'oddo:isPublic'

/**
 * Marks a route as reachable without authentication.
 *
 * The guard that reads this metadata arrives in PRD-001. It exists already
 * because ADR-0002 §3 requires every endpoint to carry either a permission or
 * an explicit `@Public()` — forgetting the guard must never be what makes an
 * endpoint open.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true)
