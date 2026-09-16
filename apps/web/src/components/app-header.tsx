'use client'

import { useRouter } from 'next/navigation'
import { useState, type JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-client'

interface AppHeaderProps {
  /**
   * Undefined while the identity is still being fetched. Spelled out rather than
   * left implicit because exactOptionalPropertyTypes distinguishes 'absent' from
   * 'present and undefined', and the caller passes the latter.
   */
  userName?: string | undefined
}

/**
 * Shown on closed pages only. `/login` has nobody to name yet, and `/health` is
 * public — putting a Keluar button on a page a visitor reached without logging
 * in would be an offer it cannot keep.
 */
export function AppHeader({ userName }: AppHeaderProps): JSX.Element {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function handleLogout(): Promise<void> {
    setLeaving(true)
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' })
    } catch {
      // Deliberately swallowed. The server may be unreachable, but a logout that
      // refuses to finish is worse than one that is only believed to have
      // worked: it leaves someone stuck on a page they are trying to leave.
    }
    router.replace('/login')
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <span className="font-semibold tracking-tight">Oddo ERP</span>

        <div className="flex min-w-0 items-center gap-3">
          {userName === undefined ? (
            <Skeleton className="h-4 w-28" data-testid="header-user-skeleton" />
          ) : (
            <span className="min-w-0 truncate text-sm text-muted-foreground">{userName}</span>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={leaving}
            onClick={() => void handleLogout()}
          >
            Keluar
          </Button>
        </div>
      </div>
    </header>
  )
}
