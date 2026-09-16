import { Injectable } from '@nestjs/common'
import type { HealthCheckResult, HealthResponse } from '@oddo/shared'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../common/prisma/prisma.service'
import { APP_VERSION_KEY } from '../common/system-setting.keys'
import { RedisService } from '../common/redis/redis.service'
import { describeError, withTimeout } from '../common/with-timeout'
import { resolveOverallStatus } from './health.status'

/** Hard ceiling per dependency probe (PRD-000 §9). */
const CHECK_TIMEOUT_MS = 2_000

const UNKNOWN_VERSION = 'unknown'

interface DatabaseProbe {
  result: HealthCheckResult
  version?: string
}

function elapsedMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n)
}

function readVersion(value: Prisma.JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()])
    const checks = { database: database.result, redis }

    return {
      status: resolveOverallStatus(checks),
      version: database.version ?? UNKNOWN_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    }
  }

  /**
   * Reads a real row rather than pinging the socket: an open TCP connection
   * proves nothing about whether the migration ran or the client matches the
   * schema, and those are the failures that actually happen.
   */
  private async checkDatabase(): Promise<DatabaseProbe> {
    const startedAt = process.hrtime.bigint()
    try {
      const row = await withTimeout(
        this.prisma.systemSetting.findUnique({ where: { key: APP_VERSION_KEY } }),
        CHECK_TIMEOUT_MS,
      )
      const latencyMs = elapsedMs(startedAt)

      if (row === null) {
        return {
          result: {
            status: 'down',
            latencyMs,
            error: `system_setting row "${APP_VERSION_KEY}" is missing — run: pnpm db:seed`,
          },
        }
      }

      return { result: { status: 'up', latencyMs }, version: readVersion(row.value) }
    } catch (error) {
      return {
        result: { status: 'down', latencyMs: elapsedMs(startedAt), error: describeError(error) },
      }
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    const startedAt = process.hrtime.bigint()
    try {
      const reply = await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS)
      const latencyMs = elapsedMs(startedAt)

      if (reply !== 'PONG') {
        return { status: 'down', latencyMs, error: `unexpected reply to PING: ${reply}` }
      }
      return { status: 'up', latencyMs }
    } catch (error) {
      return { status: 'down', latencyMs: elapsedMs(startedAt), error: describeError(error) }
    }
  }
}
