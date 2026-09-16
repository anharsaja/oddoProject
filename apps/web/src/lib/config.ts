/**
 * The one place NEXT_PUBLIC_API_URL is read (PRD-000 §2.4).
 *
 * Components import API_URL from here instead of reaching into process.env, so
 * the value shown in the "API unreachable" message is guaranteed to be the very
 * same value the failing request used.
 */
function readApiUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL

  if (typeof value !== 'string' || value === '') {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env in the repository root.',
    )
  }

  return value
}

export const API_URL = readApiUrl()
