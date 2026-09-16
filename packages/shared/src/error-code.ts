/**
 * Stable machine-readable error codes (ADR-0001 B8).
 *
 * The frontend is allowed to branch on these values, so they never change
 * meaning once shipped. `message` is for humans and may change at any time.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  STATE_CONFLICT = 'STATE_CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
