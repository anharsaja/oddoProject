'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type JSX } from 'react'

import { AppHeader } from '@/components/app-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, apiFetch } from '@/lib/api-client'
import { browserNavigation } from '@/lib/navigation'

interface Actor {
  id: string
  email: string
  name: string
  companyId: string
  isSuperadmin: boolean
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; actor: Actor }
  | { kind: 'disrupted'; message: string }

export default function HomePage(): JSX.Element {
  const router = useRouter()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function loadActor(): Promise<void> {
      try {
        const actor = await apiFetch<Actor>('/auth/me')
        if (!cancelled) {
          setState({ kind: 'ready', actor })
        }
      } catch (caught) {
        if (cancelled) {
          return
        }
        if (caught instanceof ApiError && caught.statusCode === 401) {
          // Stay in the loading state on the way out. Switching to an error view
          // first would flash a message at someone who is simply being sent to
          // the login page (BR-AUTH-012).
          const next = encodeURIComponent(browserNavigation.currentPath())
          router.replace(`/login?next=${next}`)
          return
        }
        // Anything else is an outage, not an expired session. Redirecting here
        // would have people logging in repeatedly to fix a problem that has
        // nothing to do with their credentials (§11 no. 7).
        setState({
          kind: 'disrupted',
          message:
            caught instanceof Error ? caught.message : 'Terjadi kesalahan yang tidak terduga',
        })
      }
    }

    void loadActor()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <>
      <AppHeader userName={state.kind === 'ready' ? state.actor.name : undefined} />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
        {state.kind === 'loading' ? (
          <div className="space-y-4" data-testid="home-loading">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {state.kind === 'disrupted' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sistem sedang terganggu</CardTitle>
              <CardDescription role="alert">{state.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/health" className="text-sm underline">
                Lihat status infrastruktur
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {state.kind === 'ready' ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Halo, {state.actor.name}
            </h1>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Belum ada modul</CardTitle>
                <CardDescription>
                  Layar bisnis pertama datang di PRD berikutnya. Untuk sekarang, yang bisa
                  dilihat adalah status infrastruktur.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/health" className="text-sm underline">
                  Lihat status infrastruktur
                </Link>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </>
  )
}
