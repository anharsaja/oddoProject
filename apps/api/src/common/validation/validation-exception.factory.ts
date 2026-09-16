import { BadRequestException } from '@nestjs/common'
import { ErrorCode, type ApiErrorDetail } from '@oddo/shared'
import type { ValidationError } from 'class-validator'

/** Turns the nested class-validator tree into the flat `details` array of ADR-0001 B8. */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = []

  for (const error of errors) {
    const field = parentPath === '' ? error.property : `${parentPath}.${error.property}`

    if (error.constraints) {
      for (const issue of Object.values(error.constraints)) {
        details.push({ field, issue })
      }
    }

    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field))
    }
  }

  return details
}

/**
 * Makes the global ValidationPipe speak the standard error envelope instead of
 * Nest's default `{ message: string[] }` shape.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Request validation failed',
    details: flattenValidationErrors(errors),
  })
}
