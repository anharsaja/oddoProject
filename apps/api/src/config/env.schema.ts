import { z } from 'zod'

/** Levels pino understands, in the order pino defines them. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/**
 * process.env values are always strings, so coercing straight to a number turns
 * a MISSING variable into NaN and the report says 'expected number, received nan'
 * instead of naming it as missing. Validating the string first keeps the
 * message honest.
 */
function integerBetween(min: number, max: number) {
  return z
    .string()
    .regex(/^[0-9]+$/, 'must be a whole number')
    .transform(Number)
    .refine((value) => value >= min && value <= max, `must be between ${min} and ${max}`)
}

const port = integerBetween(1, 65535)

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

/**
 * Lower-cased rather than rejected: BR-AUTH-007 stores every email in lower
 * case anyway, so normalising here means an .env written with capitals still
 * matches the row the seed created.
 */
const adminEmail = z
  .string()
  .email('must be an email address')
  .transform((value) => value.toLowerCase())

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

  // PRD-001a §2.4 — session policy
  SESSION_IDLE_TTL_MINUTES: integerBetween(5, 1440),
  SESSION_ABSOLUTE_TTL_HOURS: integerBetween(1, 168),

  // PRD-001a §2.4 — first administrator, created once by the system seed
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),
})
  /**
   * A sliding window that is allowed to outlive its own ceiling is not a
   * policy, it is a bug waiting to be discovered in production. Caught here,
   * at boot, rather than by a session that never expires.
   */
  .refine(
    (env) => env.SESSION_ABSOLUTE_TTL_HOURS * 60 > env.SESSION_IDLE_TTL_MINUTES,
    {
      path: ['SESSION_ABSOLUTE_TTL_HOURS'],
      message:
        'must be longer than SESSION_IDLE_TTL_MINUTES — an absolute limit below the idle window can never be reached',
    },
  )

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
