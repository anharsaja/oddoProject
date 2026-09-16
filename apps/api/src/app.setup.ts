import { ValidationPipe, type INestApplication } from '@nestjs/common'

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor'
import { validationExceptionFactory } from './common/validation/validation-exception.factory'
import type { Env } from './config/env.schema'

/**
 * Everything that turns a bare Nest app into *this* application.
 *
 * Kept out of main.ts so the integration tests boot through exactly the same
 * wiring the production process uses — a filter that is only installed in
 * main.ts is a filter the tests never see.
 */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix('api')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  app.useGlobalInterceptors(new RequestIdInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })
  app.enableShutdownHooks()
}
