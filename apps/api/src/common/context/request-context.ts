import { AsyncLocalStorage } from 'node:async_hooks'

/** Who the request is acting as, once a guard has established it. */
export interface RequestAuth {
  userId: string
  companyId: string
}

export interface RequestStore {
  requestId: string
  userId?: string
  companyId?: string
}

/** Express request after AuthGuard has identified the caller. */
export type RequestWithAuth = { auth?: RequestAuth }

const storage = new AsyncLocalStorage<RequestStore>()

/**
 * Per-request data that would otherwise have to be threaded through every
 * function signature. PRD-001a adds the authenticated user and their company;
 * PRD-002 will read both when applying record rules.
 */
export const RequestContext = {
  run<T>(store: RequestStore, callback: () => T): T {
    return storage.run(store, callback)
  },
  get(): RequestStore | undefined {
    return storage.getStore()
  },
  getRequestId(): string | undefined {
    return storage.getStore()?.requestId
  },
  getUserId(): string | undefined {
    return storage.getStore()?.userId
  },
  getCompanyId(): string | undefined {
    return storage.getStore()?.companyId
  },
}
