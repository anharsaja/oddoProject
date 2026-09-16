import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

import { ENV } from '../../config/env.module'
import type { Env } from '../../config/env.schema'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      datasourceUrl: env.DATABASE_URL,
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    })
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        [
          'Cannot reach the database configured in DATABASE_URL.',
          'Is the Postgres container running? Start it with: pnpm docker:up',
          `Underlying error: ${reason}`,
        ].join('\n'),
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
