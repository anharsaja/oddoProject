import type { JSX } from 'react'

import { HealthDashboard } from '@/components/health-dashboard'

/**
 * Temporary landing page. PRD-000 §10: this moves to /health as soon as
 * PRD-001 introduces a real login screen, so no layout shell is built here.
 */
export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <HealthDashboard />
    </main>
  )
}
