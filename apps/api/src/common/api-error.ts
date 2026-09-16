import { ErrorCode } from '@oddo/shared'

export interface ApiErrorDetail {
  field: string
  issue: string
}

/**
 * The single error envelope every endpoint returns (ADR-0001 B8).
 *
 * Kept in the API rather than in @oddo/shared because PRD-000 only asks
 * @oddo/shared for the health types and ErrorCode; the web app does not consume
 * this shape yet.
 */
export interface ApiErrorResponse {
  statusCode: number
  code: ErrorCode
  message: string
  details: ApiErrorDetail[]
  requestId: string
  timestamp: string
}

const STATUS_TO_CODE: ReadonlyMap<number, ErrorCode> = new Map([
  [400, ErrorCode.VALIDATION_ERROR],
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
