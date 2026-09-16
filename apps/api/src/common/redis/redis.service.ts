import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

import { ENV } from '../../config/env.module'
import type { Env } from '../../config/env.schema'
import { withTimeout } from '../with-timeout'

const READY_TIMEOUT_MS = 2_000
const SHUTDOWN_TIMEOUT_MS = 2_500

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      // With the offline queue disabled a command fails immediately instead of
      // waiting for a reconnect that may never happen — exactly what a health
      // probe needs (PRD-000 BR-INFRA-002).
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: READY_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    })

    // Without a listener, ioredis turns a dead server into an unhandled error
    // event and takes the whole process down. The health endpoint is what
    // reports this condition, so here it is deliberately swallowed.
    this.client.on('error', () => undefined)
  }

  /**
   * Gives the first connection a bounded moment to settle so the first request
   * after boot does not report a false "down". A dead Redis simply costs the
   * timeout and the application still starts.
   */
  async onModuleInit(): Promise<void> {
    if (this.client.status === 'ready') {
      return
    }

    await new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        this.client.off('ready', finish)
        resolve()
      }
      const timer = setTimeout(finish, READY_TIMEOUT_MS)
      this.client.once('ready', finish)
    })
  }

  /** Throws when Redis is unreachable; the caller decides what that means. */
  async ping(): Promise<string> {
    return this.client.ping()
  }

  /**
   * Waits for the connection to actually finish instead of only asking it to.
   *
   * `disconnect()` returns while a connection attempt is still in flight, which
   * leaves the process busy for a second or two after shutdown — long enough for
   * a test runner to report that something is still running.
   *
   * A healthy client emits 'end' immediately and this costs nothing. A client
   * that never managed to connect stays in ioredis' 'reconnecting' state and
   * never emits 'end' at all, so the bound below is what ends the wait — by
   * which point the pending attempt has expired and the process is idle.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return
    }

    const ended = new Promise<void>((resolve) => {
      this.client.once('end', () => resolve())
    })

    // Cancel the reconnect policy before closing: ioredis consults it once more
    // while handling the close event, and a strategy that always returns a delay
    // would schedule one more attempt on the way out.
    this.client.options.retryStrategy = () => null
    this.client.disconnect()

    await withTimeout(ended, SHUTDOWN_TIMEOUT_MS).catch(() => undefined)
  }
}
