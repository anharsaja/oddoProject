import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'

import { buildLoggerOptions } from './common/logging/logger.options'
import { PrismaModule } from './common/prisma/prisma.module'
import { RedisModule } from './common/redis/redis.module'
import { ENV, EnvModule } from './config/env.module'
import type { Env } from './config/env.schema'
import { HealthModule } from './health/health.module'

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => buildLoggerOptions(env),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
