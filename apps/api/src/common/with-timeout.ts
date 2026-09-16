export class TimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'TimeoutError'
  }
}

/**
 * Bounds a promise that has no timeout of its own.
 *
 * The underlying work is not cancelled — it cannot be, for a database round
 * trip — but the caller stops waiting, which is what keeps a health probe from
 * hanging along with the dependency it is probing.
 */
export async function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError()), milliseconds)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  const text = String(error)
  return text === '' ? 'unknown error' : text
}
