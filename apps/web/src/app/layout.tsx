import type { Metadata } from 'next'
import type { JSX, ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'Oddo ERP',
  description: 'Status infrastruktur Oddo ERP',
}

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="id">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
