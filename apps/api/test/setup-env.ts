import { loadTestEnv } from './test-env'

// Runs before the test framework and before any module under test is imported,
// so the validated config is built from .env.test rather than from .env.
loadTestEnv()
