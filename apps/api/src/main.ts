import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import { loadEnvOrExit } from './config/env'

async function bootstrap(): Promise<void> {
  // Before Nest builds anything: an invalid environment must never get as far
  // as opening a port (BR-INFRA-001).
  const env = loadEnvOrExit()

  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  configureApp(app, env)

  await app.listen(env.PORT)
}

bootstrap().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error)
  process.stdout.write(`\nOddo API failed to start.\n\n${reason}\n\n`)
  process.exit(1)
})
