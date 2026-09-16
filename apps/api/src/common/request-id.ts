import { v7 as uuidv7 } from 'uuid'

/** Lower-case because Node normalises incoming header names. */
export const REQUEST_ID_HEADER = 'x-request-id'

const MAX_LENGTH = 128

/**
 * Honours a caller-supplied request id when there is one, otherwise mints a
 * UUID v7 (ADR-0001 B3). Truncated so a hostile client cannot push megabytes
 * into every log line.
 */
export function resolveRequestId(incoming?: string | string[]): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim()
    if (trimmed !== '') {
      return trimmed.slice(0, MAX_LENGTH)
    }
  }
  return uuidv7()
}
