import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, type Subscription } from 'rxjs'

import { RequestContext } from '../context/request-context'
import { REQUEST_ID_HEADER, resolveRequestId } from '../request-id'

type RequestWithId = Request & { id?: string }

/**
 * Puts the request id into AsyncLocalStorage so anything downstream can reach
 * it without passing it around, and mirrors it back in the response header.
 *
 * The id itself is usually minted earlier, by the pino-http `genReqId` hook,
 * which also runs for requests that never match a route. This interceptor
 * reuses that value and only generates one when it is missing.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<RequestWithId>()
    const response = http.getResponse<Response>()

    const requestId =
      typeof request.id === 'string' && request.id !== ''
        ? request.id
        : resolveRequestId(request.headers[REQUEST_ID_HEADER])

    request.id = requestId
    if (!response.getHeader(REQUEST_ID_HEADER)) {
      response.setHeader(REQUEST_ID_HEADER, requestId)
    }

    // Subscribing inside `run` is what keeps the store alive for the handler;
    // calling next.handle() alone would leave the scope before anything runs.
    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined
      RequestContext.run({ requestId }, () => {
        subscription = next.handle().subscribe(subscriber)
      })
      return () => subscription?.unsubscribe()
    })
  }
}
