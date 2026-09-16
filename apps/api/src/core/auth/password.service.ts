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
}
