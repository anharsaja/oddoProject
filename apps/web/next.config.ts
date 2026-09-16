import path from 'node:path'

import { config as loadDotenv } from 'dotenv'
import type { NextConfig } from 'next'

// The workspace keeps one .env, at the repository root. Next only looks inside
// its own project folder, so it is loaded explicitly here.
loadDotenv({ path: path.resolve(process.cwd(), '../../.env') })

const apiUrl = process.env.NEXT_PUBLIC_API_URL
if (!apiUrl) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env in the repository root.',
  )
}

const nextConfig: NextConfig = {
  transpilePackages: ['@oddo/shared'],
  // The E2E run starts a second dev server against the same project directory.
  // Two Next processes sharing one .next would fight over it, so the E2E one is
  // pointed somewhere else (PRD-001b §11 no. 9).
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
  // `pnpm lint` at the repository root is the single quality gate and already
  // covers this app. Letting `next build` start a second, separately configured
  // ESLint only produces a warning about a plugin the root config does not use.
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_API_URL: apiUrl },
}

export default nextConfig
