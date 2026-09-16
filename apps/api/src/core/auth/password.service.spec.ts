import { ARGON2_OPTIONS, DUMMY_PASSWORD_HASH, PasswordService } from './password.service'

describe('PasswordService', () => {
  const passwords = new PasswordService()

  it('verifies a password against its own hash', async () => {
    const hash = await passwords.hash('correct horse battery staple')

    await expect(passwords.verify(hash, 'correct horse battery staple')).resolves.toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hash = await passwords.hash('correct horse battery staple')

    await expect(passwords.verify(hash, 'Correct horse battery staple')).resolves.toBe(false)
    await expect(passwords.verify(hash, '')).resolves.toBe(false)
  })

  it('produces a different hash every time, because the salt is random', async () => {
    const first = await passwords.hash('same password')
    const second = await passwords.hash('same password')

    expect(first).not.toBe(second)
    await expect(passwords.verify(first, 'same password')).resolves.toBe(true)
    await expect(passwords.verify(second, 'same password')).resolves.toBe(true)
  })

  it('stores the algorithm and parameters inside the hash', async () => {
    const hash = await passwords.hash('whatever')

    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).toContain('m=19456')
    expect(hash).toContain('t=2')
    expect(hash).toContain('p=1')
  })

  it('treats a malformed hash as a failed verification rather than an error', async () => {
    await expect(passwords.verify('not-a-hash', 'whatever')).resolves.toBe(false)
  })

  /**
   * The dummy exists to cost the same as a real verification. A dummy hashed
   * with different parameters costs a different amount of time, and the leak it
   * was added to close comes straight back (BR-AUTH-009).
   */
  describe('verifyDummy', () => {
    it('uses exactly the parameters hash() uses', async () => {
      const real = await passwords.hash('any password at all')
      const parametersOf = (encoded: string): string => encoded.split('$')[3] ?? ''

      expect(DUMMY_PASSWORD_HASH.startsWith('$argon2id$')).toBe(true)
      expect(parametersOf(DUMMY_PASSWORD_HASH)).toBe(parametersOf(real))
      expect(parametersOf(DUMMY_PASSWORD_HASH)).toBe(
        `m=${String(ARGON2_OPTIONS.memoryCost)},t=${String(ARGON2_OPTIONS.timeCost)},p=${String(ARGON2_OPTIONS.parallelism)}`,
      )
    })

    it('completes without throwing and without revealing anything', async () => {
      await expect(passwords.verifyDummy()).resolves.toBeUndefined()
    })
  })
})
