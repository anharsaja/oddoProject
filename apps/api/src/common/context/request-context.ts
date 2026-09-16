import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestStore {
  requestId: string
}

const storage = new AsyncLocalStorage<RequestStore>()

/**
 * Per-request data that would otherwise have to be threaded through every
 * function signature. PRD-000 only puts `requestId` in here; PRD-001 adds the
 * authenticated user and PRD-002 the active company.
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
}
