import { RequestMethod } from '@nestjs/common'
import type { Params } from 'nestjs-pino'
import type { Options } from 'pino-http'

import type { Env } from '../../config/env.schema'
import { REQUEST_ID_HEADER, resolveRequestId } from '../request-id'

/**
 * Structured JSON logging (ADR-0001 B9).
 *
 * `genReqId` is the single place a request id is minted, and it runs as
 * middleware — which means it also covers requests that never match a route.
 * Cookies and authorization headers are removed, never merely masked.
 */
export function buildLoggerOptions(env: Env): Params {
  const pinoHttp: Options = {
    level: env.LOG_LEVEL,
    genReqId: (request, response) => {
      const id = resolveRequestId(request.headers[REQUEST_ID_HEADER])
      response.setHeader(REQUEST_ID_HEADER, id)
      return id
    },
    customProps: (request) => ({ requestId: String(request.id) }),
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      remove: true,
    },
    autoLogging: true,
  }

  // nestjs-pino defaults to the bare '*' route, which Express 5 (NestJS 11) only
  // accepts after printing an 'Unsupported route path' warning and rewriting it.
  // '{*path}' is the spelling path-to-regexp v8 wants, and it resolves to exactly
  // the same coverage: Nest prefixes middleware paths with the global prefix, so
  // both spellings watch '/api/**' — the entire surface this application serves.
  const forRoutes: Params['forRoutes'] = [{ path: '{*path}', method: RequestMethod.ALL }]

  if (env.NODE_ENV !== 'development') {
    return { pinoHttp, forRoutes }
  }

  return {
    forRoutes,
    pinoHttp: {
      ...pinoHttp,
      transport: {
        target: 'pino-pretty',
        options: {
          singleLine: true,
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,req,res',
        },
      },
    },
  }
}
