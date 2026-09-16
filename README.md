# Oddo — ERP Web App

Modular-monolith ERP inspired by Odoo. This repository is a pnpm workspace with a
NestJS backend, a Next.js frontend, and PostgreSQL + Redis running in Docker.

> Design documents live in `docs/`. Start with `docs/PRODUCT-SCOPE.md`, then the
> ADRs in `docs/adr/`. Work is planned as PRDs in `docs/prd/`.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | |
| Docker Desktop | any current | must be **running** before `pnpm docker:up` |
| pnpm | 9.15.4 | installed through corepack, see below |

pnpm is pinned by the `packageManager` field in `package.json`, so it is enabled
rather than installed:

```bash
corepack enable
```

<details>
<summary>Windows: <code>corepack enable</code> fails with <code>EPERM</code></summary>

Corepack writes its shims next to the Node executable, which is usually under
`C:\Program Files\nodejs` and not writable without an elevated shell. Either run
the command from an Administrator terminal, or point corepack at a directory
that is already on your `PATH`:

```bash
corepack enable --install-directory "$APPDATA/npm" pnpm
```

</details>

---

## 2. Running it from scratch

```bash
pnpm install

cp .env.example .env          # PowerShell: Copy-Item .env.example .env

pnpm docker:up                # starts Postgres + Redis, waits until both are healthy
pnpm db:migrate               # applies migrations to oddo_dev
pnpm db:seed                  # inserts the system settings

pnpm dev                      # API on :3001, web on :3000
```

Open <http://localhost:3000>. The page shows the application version and a card
for Database and Redis, both of which should read **up**.

The API itself is at <http://localhost:3001/api/health>.

---

## 3. Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs API and web together. Fails immediately if `.env` is incomplete |
| `pnpm build` | Builds every package in the workspace |
| `pnpm test` | Unit + integration tests. Needs Docker running; uses `oddo_test` |
| `pnpm lint` | ESLint over the whole workspace, warnings treated as errors |
| `pnpm typecheck` | `tsc --noEmit` for every package |
| `pnpm format` | Prettier write (`pnpm format:check` to only verify) |
| `pnpm docker:up` | Starts Postgres and Redis and waits for their healthchecks |
| `pnpm docker:down` | Stops both containers, keeps the data |
| `pnpm docker:reset` | Stops both and **deletes their volumes** (all local data). `pnpm docker:down -v` does the same |
| `pnpm db:migrate` | `prisma migrate dev` against `oddo_dev` |
| `pnpm db:seed` | System seed, idempotent |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | Drops `oddo_dev`, re-applies every migration, re-seeds |

---

## 4. How the pieces fit

```
apps/api       NestJS. REST under the /api prefix. Prisma + Redis
apps/web       Next.js App Router, Tailwind, shadcn/ui
packages/shared  Types shared by both — declare a shared type ONCE, here
packages/config  Base tsconfig, ESLint and Prettier configuration
docker/          Postgres init script that creates the test database
```

Dependencies only ever flow `apps -> packages`. A lint rule enforces it.

### Ports

| Service | Port | Why |
|---|---|---|
| web | 3000 | |
| api | 3001 | |
| Postgres | **5433** | 5432 is usually taken by a locally installed Postgres |
| Redis | 6379 | index `/0` for development, `/1` for tests |

### Databases

The Postgres container serves two databases: `oddo_dev` for development and
`oddo_test` for the integration tests. `pnpm test` never touches `oddo_dev`.

---

## 5. Troubleshooting

**`pnpm db:migrate` cannot connect / `oddo_test` does not exist**

`oddo_test` is created by `docker/postgres/init/01-create-databases.sh`, and the
Postgres image only runs that script the first time the data volume is created.
If the volume already existed, the script never ran:

```bash
pnpm docker:reset     # or: pnpm docker:down -v
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

**The API exits immediately printing a list of variables**

That is the environment gate doing its job. Copy `.env.example` to `.env` and
fill in whatever it names.

**The health page says the database is down and mentions `system_setting`**

Migrations or the seed have not run yet:

```bash
pnpm db:migrate
pnpm db:seed
```

**The health page says "API tidak dapat dihubungi"**

The backend is not running, or it is not on the URL in `NEXT_PUBLIC_API_URL`.
Check the terminal running `pnpm dev`.

**Port 3000 or 3001 already in use**

Change `PORT` in `.env` for the API. For the web app, run
`pnpm --filter @oddo/web dev -- -p 3002`.
