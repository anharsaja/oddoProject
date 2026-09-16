import type { ErrorCode } from './error-code'

export interface ApiErrorDetail {
  field: string
  issue: string
}

/**
 * The single error envelope every endpoint returns (ADR-0001 B8).
 *
 * Lives here rather than in the API because both sides need it: the API builds
 * it in AllExceptionsFilter, and the web client parses it to get at `message`
 * and `code`. Declaring it twice is how the two drift apart.
 */
export interface ApiErrorResponse {
  statusCode: number
  code: ErrorCode
  message: string
  details: ApiErrorDetail[]
  requestId: string
  timestamp: string
}
