import { PasswordService } from './password.service'

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
})
