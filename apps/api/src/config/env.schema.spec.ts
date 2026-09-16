import { EnvValidationError, formatEnvValidationError, parseEnv } from './env.schema'

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://oddo:oddo@localhost:5433/oddo_test?schema=public',
  REDIS_URL: 'redis://localhost:6379/1',
  WEB_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
  SESSION_IDLE_TTL_MINUTES: '120',
  SESSION_ABSOLUTE_TTL_HOURS: '8',
  ADMIN_EMAIL: 'admin@oddo.local',
  ADMIN_PASSWORD: 'ChangeMe!2026',
}

describe('parseEnv', () => {
  it('accepts a complete environment and coerces PORT to a number', () => {
    const env = parseEnv(validEnv)

    expect(env.NODE_ENV).toBe('test')
    expect(env.PORT).toBe(3001)
    expect(typeof env.PORT).toBe('number')
    expect(env.LOG_LEVEL).toBe('debug')
  })

  it('ignores variables it does not know about', () => {
    const env = parseEnv({ ...validEnv, SOMETHING_ELSE: 'whatever' })

    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL)
  })

  it('rejects a missing variable and names it', () => {
    const { DATABASE_URL: _removed, ...withoutDatabaseUrl } = validEnv

    expect(() => parseEnv(withoutDatabaseUrl)).toThrow(EnvValidationError)

    try {
      parseEnv(withoutDatabaseUrl)
      throw new Error('parseEnv should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const issues = (error as EnvValidationError).issues
      expect(issues).toHaveLength(1)
      expect(issues[0]?.variable).toBe('DATABASE_URL')
      expect(issues[0]?.problem).toBe('is missing')
    }
  })

  it('rejects a malformed URL', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow(EnvValidationError)
    expect(() => parseEnv({ ...validEnv, WEB_ORIGIN: 'localhost:3000' })).toThrow(
      EnvValidationError,
    )
  })

  it('rejects a database URL that is not postgresql', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'mysql://oddo@localhost/oddo' })).toThrow(
      EnvValidationError,
    )
  })

  it('rejects a log level pino does not understand', () => {
    expect(() => parseEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(EnvValidationError)
  })

  it('lower-cases ADMIN_EMAIL so it matches the row the seed created', () => {
    const env = parseEnv({ ...validEnv, ADMIN_EMAIL: 'Admin@Oddo.Local' })

    expect(env.ADMIN_EMAIL).toBe('admin@oddo.local')
  })

  it('rejects an admin password shorter than 12 characters', () => {
    expect(() => parseEnv({ ...validEnv, ADMIN_PASSWORD: 'short' })).toThrow(EnvValidationError)
  })

  it('rejects an absolute session limit that the idle window can never reach', () => {
    try {
      parseEnv({ ...validEnv, SESSION_IDLE_TTL_MINUTES: '120', SESSION_ABSOLUTE_TTL_HOURS: '1' })
      throw new Error('parseEnv should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const issues = (error as EnvValidationError).issues
      // The report has to name both variables — one alone does not tell an
      // operator what to change (AC-001a-11).
      const report = issues.map((issue) => `${issue.variable}: ${issue.problem}`).join(' | ')
      expect(report).toContain('SESSION_ABSOLUTE_TTL_HOURS')
      expect(report).toContain('SESSION_IDLE_TTL_MINUTES')
    }
  })

  it('accepts an absolute limit that is longer than the idle window', () => {
    const env = parseEnv({ ...validEnv, SESSION_IDLE_TTL_MINUTES: '60', SESSION_ABSOLUTE_TTL_HOURS: '2' })

    expect(env.SESSION_IDLE_TTL_MINUTES).toBe(60)
    expect(env.SESSION_ABSOLUTE_TTL_HOURS).toBe(2)
  })

  it('reports every problem at once, not just the first', () => {
    const { DATABASE_URL: _a, REDIS_URL: _b, ...broken } = validEnv

    try {
      parseEnv(broken)
      throw new Error('parseEnv should have thrown')
    } catch (error) {
      const issues = (error as EnvValidationError).issues
      expect(issues.map((issue) => issue.variable).sort()).toEqual(['DATABASE_URL', 'REDIS_URL'])
    }
  })

  it('formats a report that names the variable and the env file', () => {
    const { PORT: _port, ...withoutPort } = validEnv

    try {
      parseEnv(withoutPort)
      throw new Error('parseEnv should have thrown')
    } catch (error) {
      const report = formatEnvValidationError(error as EnvValidationError, '/repo/.env')
      expect(report).toContain('PORT')
      expect(report).toContain('is missing')
      expect(report).toContain('/repo/.env')
    }
  })
})
