import { Global, Module } from '@nestjs/common'

import { getEnv } from './env'
import type { Env } from './env.schema'

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV')

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => getEnv() }],
  exports: [ENV],
})
export class EnvModule {}
