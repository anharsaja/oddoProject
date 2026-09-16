import { Injectable } from '@nestjs/common'
import { Algorithm, hash, verify } from '@node-rs/argon2'

/**
 * OWASP's low-memory argon2id profile (PRD-001a §2.4).
 *
 * Deliberately slow: ~50–150 ms per verification. Do not lower these to make
 * tests faster — the tests would then stop exercising the thing that protects
 * every password in the system.
 */
export const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * A real argon2id hash of a random string nobody kept, with exactly the
 * parameters above (BR-AUTH-009).
 *
 * It exists to be verified against and fail. The parameters have to match
 * ARGON2_OPTIONS character for character: a dummy hashed with a different
 * memoryCost takes a different amount of time to reject, and the timing leak it
 * was added to close reopens.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$wlbrROCe9McPcQSDwVMrSg$Qi5e5FPWF2xOXwd5drtW4dXB47A0JF+IPzH4gPAe6nA'

@Injectable()
export class PasswordService {
  /** Returns the full encoded string: algorithm, parameters and salt included. */
  async hash(plainText: string): Promise<string> {
    return hash(plainText, ARGON2_OPTIONS)
  }

  /**
   * A malformed or truncated hash is a failed verification, not a crash. The
   * parameters are read back out of the stored string, so they are not passed
   * in again here.
   */
  async verify(passwordHash: string, plainText: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainText)
    } catch {
      return false
    }
  }

  /**
   * Burns the same time a real verification would, and throws the answer away.
   *
   * Called on the login paths that have no password to check — unknown email,
   * deactivated account — so that the response time cannot be used to work out
   * which addresses have accounts here (BR-AUTH-009).
   */
  async verifyDummy(): Promise<void> {
    await this.verify(DUMMY_PASSWORD_HASH, 'not the password behind the dummy hash')
  }
}
