import { IsEmail, IsString, Length } from 'class-validator'

export class LoginDto {
  @IsEmail({}, { message: 'must be an email address' })
  email!: string

  /**
   * Length is bounded at both ends on purpose: an empty password is a malformed
   * request (400), not a wrong credential (401) — see PRD-001a §11 no. 11 — and
   * an unbounded one would hand an attacker a way to make argon2 chew through
   * megabytes per request.
   */
  @IsString()
  @Length(1, 200)
  password!: string
}
