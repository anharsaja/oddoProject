import { randomBytes } from 'node:crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { RedisService } from '../../common/redis/redis.service'
import { ENV } from '../../config/env.module'
import type { Env } from '../../config/env.schema'
import { resolveSessionTtl, type SessionTtlPolicy } from './session-ttl'

/** 32 bytes = 256 bits of CSPRNG output (ADR-0001 B2), 43 characters encoded. */
const SESSION_ID_BYTES = 32

/** What is actually stored under `session:<sid>`. */
interface SessionPayload {
  userId: string
  companyId: string
  createdAt: string
}

export interface ActiveSession {
  sid: string
  userId: string
  companyId: string
  createdAt: Date
  idleExpiresAt: Date
  absoluteExpiresAt: Date
}

export function sessionKey(sid: string): string {
  return `session:${sid}`
}

export function userSessionsKey(userId: string): string {
  return `user:${userId}:sessions`
}

function parsePayload(raw: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const candidate = parsed as Record<string, unknown>
    if (
      typeof candidate['userId'] !== 'string' ||
      typeof candidate['companyId'] !== 'string' ||
      typeof candidate['createdAt'] !== 'string'
    ) {
      return null
    }
    return {
      userId: candidate['userId'],
      companyId: candidate['companyId'],
      createdAt: candidate['createdAt'],
    }
  } catch {
    return null
  }
}

/**
 * Sessions live in Redis and nowhere else (ADR-0001 B2). Postgres keeps no list
 * of them, which is what makes revocation immediate: deleting the key ends the
 * session for every request that follows.
 *
 * Failures here are infrastructure failures and are allowed to propagate. A
 * caller that turned an unreachable Redis into "401 Unauthorized" would tell
 * every logged-in user their credentials were wrong (PRD-001a §11 no. 1 and 2).
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name)

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly redis: RedisService,
  ) {}

  get policy(): SessionTtlPolicy {
    return {
      idleTtlSeconds: this.env.SESSION_IDLE_TTL_MINUTES * 60,
      absoluteTtlSeconds: this.env.SESSION_ABSOLUTE_TTL_HOURS * 3_600,
    }
  }

  async create(userId: string, companyId: string): Promise<ActiveSession> {
    const sid = randomBytes(SESSION_ID_BYTES).toString('base64url')
    const createdAt = new Date()
    const decision = resolveSessionTtl(createdAt, createdAt, this.policy)
    const payload: SessionPayload = {
      userId,
      companyId,
      createdAt: createdAt.toISOString(),
    }

    // The index is what lets PRD-002 revoke every session of a user without
    // scanning the keyspace (BR-AUTH-006). Its own TTL is refreshed on each
    // login so it never outlives the longest session it points at.
    await this.redis.connection
      .multi()
      .set(sessionKey(sid), JSON.stringify(payload), 'EX', decision.ttlSeconds)
      .sadd(userSessionsKey(userId), sid)
      .expire(userSessionsKey(userId), this.policy.absoluteTtlSeconds)
      .exec()

    return {
      sid,
      userId,
      companyId,
      createdAt,
      idleExpiresAt: decision.idleExpiresAt,
      absoluteExpiresAt: decision.absoluteExpiresAt,
    }
  }

  /**
   * Reads a session and slides its idle window forward, never past the absolute
   * ceiling (BR-AUTH-003).
   *
   * Returns null when there is no usable session — missing, unreadable, or past
   * its ceiling. A session past the ceiling is destroyed rather than merely
   * refused (BR-AUTH-004), so Redis does not accumulate the dead.
   */
  async read(sid: string): Promise<ActiveSession | null> {
    const raw = await this.redis.connection.get(sessionKey(sid))
    if (raw === null) {
      return null
    }

    const payload = parsePayload(raw)
    if (payload === null) {
      await this.redis.connection.del(sessionKey(sid))
      return null
    }

    const createdAt = new Date(payload.createdAt)
    const decision = resolveSessionTtl(createdAt, new Date(), this.policy)

    if (decision.expired) {
      this.logger.log(
        { event: 'auth.session.expired_absolute', userId: payload.userId },
        'Session passed its absolute limit',
      )
      await this.forget(sid, payload.userId)
      return null
    }

    await this.redis.connection.expire(sessionKey(sid), decision.ttlSeconds)

    return {
      sid,
      userId: payload.userId,
      companyId: payload.companyId,
      createdAt,
      idleExpiresAt: decision.idleExpiresAt,
      absoluteExpiresAt: decision.absoluteExpiresAt,
    }
  }

  /**
   * Ends a session and reports whose it was, so the caller can log the logout
   * against a user.
   *
   * Idempotent: an unknown or already-expired sid is not an error, because the
   * caller's goal — "this session must not work" — is already true. Returns
   * null when the owner could no longer be determined.
   */
  async destroy(sid: string): Promise<string | null> {
    const raw = await this.redis.connection.get(sessionKey(sid))
    const payload = raw === null ? null : parsePayload(raw)

    if (payload === null) {
      // The key is already gone, so its owner is unknown; the index member is
      // swept later by listByUser.
      await this.redis.connection.del(sessionKey(sid))
      return null
    }

    await this.forget(sid, payload.userId)
    return payload.userId
  }

  /**
   * Live session ids of one user, sweeping members whose session key has
   * expired on the way (PRD-001a §11 no. 12): Redis does not remove a SET
   * member when some other key expires, so the set has to be tidied by whoever
   * reads it.
   */
  async listByUser(userId: string): Promise<string[]> {
    const sids = await this.redis.connection.smembers(userSessionsKey(userId))
    if (sids.length === 0) {
      return []
    }

    const pipeline = this.redis.connection.multi()
    for (const sid of sids) {
      pipeline.exists(sessionKey(sid))
    }
    const results = await pipeline.exec()

    const alive: string[] = []
    const dead: string[] = []

    sids.forEach((sid, index) => {
      const entry = results?.[index]
      const exists = entry !== undefined && entry[0] === null && entry[1] === 1
      if (exists) {
        alive.push(sid)
      } else {
        dead.push(sid)
      }
    })

    if (dead.length > 0) {
      await this.redis.connection.srem(userSessionsKey(userId), ...dead)
    }

    return alive
  }

  private async forget(sid: string, userId: string): Promise<void> {
    await this.redis.connection
      .multi()
      .del(sessionKey(sid))
      .srem(userSessionsKey(userId), sid)
      .exec()
  }
}
