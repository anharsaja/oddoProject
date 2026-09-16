import { ErrorCode } from '@oddo/shared'

/**
 * The error *shape* lives in @oddo/shared because both applications need it.
 * What stays here is the logic that maps HTTP status codes onto that shape —
 * behaviour, not contract, and nothing in the web app has any use for it.
 */
const STATUS_TO_CODE: ReadonlyMap<number, ErrorCode> = new Map([
  [400, ErrorCode.VALIDATION_ERROR],
  [401, ErrorCode.UNAUTHORIZED],
  [403, ErrorCode.FORBIDDEN],
  [404, ErrorCode.NOT_FOUND],
  [409, ErrorCode.STATE_CONFLICT],
])

export function errorCodeForStatus(status: number): ErrorCode {
  return STATUS_TO_CODE.get(status) ?? ErrorCode.INTERNAL_ERROR
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.values(ErrorCode).includes(value as ErrorCode)
}
