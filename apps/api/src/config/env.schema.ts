import { z } from 'zod'

/** Levels pino understands, in the order pino defines them. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/**
 * process.env values are always strings, so coercing straight to a number turns
 * a MISSING variable into NaN and the report says 'expected number, received nan'
 * instead of naming it as missing. Validating the string first keeps the
 * message honest.
 */
const port = z
  .string()
  .regex(/^[0-9]+$/, 'must be a whole number')
  .transform(Number)
  .refine((value) => value >= 1 && value <= 65535, 'must be between 1 and 65535')

/**
 * An origin for CORS, not merely any URL: 'localhost:3000' parses as a URL whose
 * scheme is 'localhost', which would silently produce a CORS rule matching
 * nothing at all.
 */
const httpOrigin = z
  .string()
  .url('must be a URL')
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'must start with http:// or https://',
  )

const postgresUrl = z
  .string()
  .url('must be a URL')
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'must start with postgresql://',
  )

const redisUrl = z
  .string()
  .url('must be a URL')
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'must start with redis://',
  )

/**
 * Every variable the API needs, all of them mandatory (PRD-000 §2.4).
 *
 * Nothing here has a default on purpose: a default is a silent guess, and a
 * silent guess about DATABASE_URL is how a test run ends up writing to the
 * development database.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: port,
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  WEB_ORIGIN: httpOrigin,
  LOG_LEVEL: z.enum(LOG_LEVELS),
})

export type Env = z.infer<typeof envSchema>

export interface EnvIssue {
  variable: string
  problem: string
}

/** Thrown instead of a raw ZodError so the boot path can print something readable. */
export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[]

  constructor(issues: readonly EnvIssue[]) {
    super(`Invalid environment configuration (${issues.length} problem(s))`)
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (result.success) {
    return result.data
  }

  const issues: EnvIssue[] = result.error.issues.map((issue) => ({
    variable: issue.path.join('.') || '(unknown)',
    problem: issue.message === 'Required' ? 'is missing' : issue.message,
  }))

  throw new EnvValidationError(issues)
}

/** Human-readable report printed when the process refuses to boot. */
export function formatEnvValidationError(error: EnvValidationError, envFilePath: string): string {
  const lines = [
    '',
    'Oddo API cannot start: the environment configuration is not valid.',
    '',
    ...error.issues.map((issue) => `  - ${issue.variable}: ${issue.problem}`),
    '',
    `Expected file: ${envFilePath}`,
    'Create it by copying .env.example, then fill in the values listed above.',
    '',
  ]
  return `${lines.join('\n')}\n`
}
