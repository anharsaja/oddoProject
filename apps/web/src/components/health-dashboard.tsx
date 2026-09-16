'use client'

import type { HealthCheckResult, HealthResponse } from '@oddo/shared'
import { useCallback, useEffect, useState, type JSX } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { API_URL } from '@/lib/config'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: HealthResponse }
  | { kind: 'unreachable' }

function DependencyCard({
  label,
  result,
}: {
  label: string
  result: HealthCheckResult
}): JSX.Element {
  const isUp = result.status === 'up'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={isUp ? 'success' : 'destructive'}>{result.status}</Badge>
        </div>
        <CardDescription>
          {isUp
            ? `Merespons dalam ${String(result.latencyMs ?? 0)} ms`
            : (result.error ?? 'Tidak dapat dihubungi')}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function LoadingState(): JSX.Element {
  return (
    <div className="space-y-4" data-testid="health-loading">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

export function HealthDashboard(): JSX.Element {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

  /**
   * A 503 still carries a full health body, so only a transport failure counts
   * as "unreachable" — a degraded system must keep showing which dependency is
   * the one that is down.
   */
  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' })
    try {
      const response = await fetch(`${API_URL}/health`, { cache: 'no-store' })
      const health = (await response.json()) as HealthResponse
      setState({ kind: 'loaded', health })
    } catch {
      setState({ kind: 'unreachable' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Oddo ERP</h1>
        {state.kind === 'loaded' ? (
          <p className="text-sm text-muted-foreground">Versi {state.health.version}</p>
        ) : null}
      </header>

      {state.kind === 'loading' ? <LoadingState /> : null}

      {state.kind === 'unreachable' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API tidak dapat dihubungi</CardTitle>
            <CardDescription>
              API tidak dapat dihubungi di <span className="font-mono">{API_URL}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void load()}>Coba lagi</Button>
          </CardContent>
        </Card>
      ) : null}

      {state.kind === 'loaded' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <DependencyCard label="Database" result={state.health.checks.database} />
            <DependencyCard label="Redis" result={state.health.checks.redis} />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => void load()}>
              Muat ulang
            </Button>
            <span className="text-sm text-muted-foreground">
              Status: {state.health.status === 'ok' ? 'sehat' : 'terdegradasi'}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
