import { loadEnvOrExit } from './env'

/**
 * Standalone environment gate for `pnpm dev`.
 *
 * `nest start --watch` never exits when the application process dies — that is
 * what a watcher is for — so an invalid environment would print an error and
 * then sit there forever. Running this check first makes the dev script itself
 * fail fast with a non-zero exit code (BR-INFRA-001, AC-000-04), while hot
 * reload still works once the environment is valid.
 */
loadEnvOrExit()
process.stdout.write('environment ok\n')
