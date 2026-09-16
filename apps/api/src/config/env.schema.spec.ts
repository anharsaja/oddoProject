import { EnvValidationError, formatEnvValidationError, parseEnv } from './env.schema'

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://oddo:oddo@localhost:5433/oddo_test?schema=public',
  REDIS_URL: 'redis://localhost:6379/1',
  WEB_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
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
