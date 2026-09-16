import type { JSX } from 'react'

import { HealthDashboard } from '@/components/health-dashboard'

/**
 * Public on purpose (PRD-001b §10): when Redis is down nobody can log in, and
 * that is exactly the moment someone needs to see why. No header shell here —
 * this page is reachable without an identity to put in one.
 */
export default function HealthPage(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <HealthDashboard />
    </main>
  )
}
