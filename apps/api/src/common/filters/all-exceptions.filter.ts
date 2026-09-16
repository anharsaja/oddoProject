import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { ApiErrorDetail, ApiErrorResponse } from '@oddo/shared'
import type { Request, Response } from 'express'

import { errorCodeForStatus, isErrorCode } from '../api-error'
import { REQUEST_ID_HEADER, resolveRequestId } from '../request-id'

type RequestWithId = Request & { id?: string }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function readDetails(payload: Record<string, unknown> | undefined): ApiErrorDetail[] {
  const details = payload?.['details']
  if (!Array.isArray(details)) {
    return []
  }
  return details.filter((entry): entry is ApiErrorDetail => {
    const record = asRecord(entry)
    return typeof record?.['field'] === 'string' && typeof record['issue'] === 'string'
  })
}

function readMessage(
  payload: Record<string, unknown> | undefined,
  exception: unknown,
  status: number,
): string {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    // Never echo an internal failure back to the caller.
    return 'Internal server error'
  }
  const message = payload?.['message']
  if (typeof message === 'string' && message !== '') {
    return message
  }
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0]
  }
  if (typeof payload?.['error'] === 'string') {
    return payload['error']
  }
  return exception instanceof Error && exception.message !== ''
    ? exception.message
    : 'Request failed'
}

/**
 * The only place in the application that builds an error body (ADR-0001 B8).
 * Controllers never assemble one themselves.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<RequestWithId>()
    const response = http.getResponse<Response>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const payload = exception instanceof HttpException ? asRecord(exception.getResponse()) : undefined

    const rawCode = payload?.['code']
    const body: ApiErrorResponse = {
      statusCode: status,
      code: isErrorCode(rawCode) ? rawCode : errorCodeForStatus(status),
      message: readMessage(payload, exception, status),
      details: readDetails(payload),
      requestId: this.resolveId(request, response),
      timestamp: new Date().toISOString(),
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId: body.requestId, path: request.url, err: exception },
        'Unhandled exception',
      )
    }

    if (!response.getHeader(REQUEST_ID_HEADER)) {
      response.setHeader(REQUEST_ID_HEADER, body.requestId)
    }
    response.status(status).json(body)
  }

  /**
   * Reuses the id already assigned to this request. A route that matched no
   * handler never reaches the interceptor, so the header set by pino-http is
   * the reliable source here.
   */
  private resolveId(request: RequestWithId, response: Response): string {
    if (typeof request.id === 'string' && request.id !== '') {
      return request.id
    }
    const fromHeader = response.getHeader(REQUEST_ID_HEADER)
    if (typeof fromHeader === 'string' && fromHeader !== '') {
      return fromHeader
    }
    return resolveRequestId(request.headers[REQUEST_ID_HEADER])
  }
}
