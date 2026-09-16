---
id: PRD-000
title: Project scaffolding — monorepo, Docker, Prisma, health check
status: draft
priority: P0
modules: [infra]
depends_on: []
blocks: [PRD-001]
estimasi: ~5 jam / 1 sesi coder
created: 2026-09-16
updated: 2026-09-16
---

# PRD-000 — Project Scaffolding

> Pembaca dokumen ini adalah engineer yang **belum pernah ikut diskusi apa pun**
> tentang project ini. Semua yang dia butuhkan harus ada di sini.
>
> **Wajib dibaca sebelum mulai:** `docs/adr/ADR-0001-tech-stack.md` dan
> `docs/adr/ADR-0002-arsitektur-inti.md`.

---

## 1. Ringkasan

Menyiapkan kerangka project Oddo ERP: monorepo pnpm berisi backend NestJS dan frontend
Next.js, database PostgreSQL dan Redis lewat Docker, Prisma yang tersambung dan terbukti
bisa migrasi, plus perkakas kualitas (lint, typecheck, test) yang semuanya hijau.

PRD ini **tidak memuat business logic sama sekali**. Tidak ada auth, tidak ada company,
tidak ada produk. Satu-satunya fitur yang jadi adalah *health check* — dan itu sengaja,
karena health check menyentuh seluruh rantai (browser → Next.js → NestJS → Prisma →
Postgres, dan NestJS → Redis) sehingga membuktikan semua sambungan benar-benar hidup.

**Masalah yang diselesaikan:** tanpa kerangka ini, PRD-001 harus mengurus setup
infrastruktur sambil mendesain data model. Dua jenis pekerjaan yang sangat berbeda
dalam satu sesi hampir pasti tidak selesai, dan kalau bermasalah, tidak jelas yang salah
setup-nya atau desainnya.

---

## 2. Scope

### 2.1 Termasuk (In Scope)

- [ ] Monorepo pnpm workspace: `apps/api`, `apps/web`, `packages/shared`, `packages/config`
- [ ] `docker-compose.yml` berisi PostgreSQL 16 dan Redis 7 dengan volume persisten
- [ ] `apps/api`: NestJS yang berjalan, dengan global `ValidationPipe`, exception filter,
      request-id interceptor, dan logger pino
- [ ] Validasi environment variable saat boot memakai `zod` — gagal keras kalau kurang
- [ ] Prisma tersambung ke Postgres, dengan model `SystemSetting`, satu file migrasi
      yang di-commit, dan seed sistem
- [ ] Endpoint `GET /api/health` yang memeriksa database dan Redis sungguhan
- [ ] `apps/web`: Next.js dengan Tailwind + shadcn/ui terpasang, dan satu halaman
      yang menampilkan hasil `GET /api/health`
- [ ] `packages/shared`: tipe `HealthResponse` yang dipakai backend **dan** frontend
- [ ] `packages/config`: konfigurasi ESLint dan `tsconfig` base yang di-extend keduanya
- [ ] Jest di `apps/api` (unit + integration dengan Postgres nyata), Vitest di `apps/web`
- [ ] Script npm di root: `dev`, `build`, `test`, `lint`, `typecheck`, `db:*`, `docker:*`
- [ ] `.env.example` lengkap dan `README.md` berisi cara menjalankan dari nol
- [ ] `.gitignore`, dan repo di-`git init` kalau belum

### 2.2 Tidak Termasuk (Out of Scope)

| Yang tidak dibuat | Ditunda ke |
|---|---|
| Authentication, session, user, password | PRD-001 |
| Company, permission, audit log | PRD-002 |
| Tabel bisnis apa pun | PRD-003 dan seterusnya |
| Playwright / E2E | PRD-001 (begitu ada halaman login yang layak diuji) |
| CI/CD pipeline | V1 |
| S3-compatible object storage | V1 (saat attachment masuk) |
| Dockerfile untuk aplikasi (production image) | V1 — sekarang Docker hanya untuk Postgres & Redis |
| Turborepo / Nx | Ditolak di `ADR-0001` B1 |

### 2.3 Asumsi

- Developer sudah punya Node.js 20+ dan Docker Desktop di mesinnya.
- pnpm dipasang lewat `corepack enable`, bukan install global — supaya versinya terkunci
  oleh field `packageManager` di `package.json`.
- Lingkungan pengembangan Windows. Semua script harus jalan di PowerShell **dan** di
  shell POSIX — hindari sintaks khusus salah satunya (jangan pakai `&&` di script npm
  yang bergantung pada shell, pakai `pnpm run a && pnpm run b` lewat npm-run-all atau
  pisah jadi beberapa script).

---

## 3. Dependency

| Arah | Item | Keterangan |
|---|---|---|
| Butuh | — | PRD pertama, tidak bergantung pada apa pun |
| Memblokir | PRD-001 | Auth tidak bisa dimulai tanpa kerangka, Prisma, dan Redis |

**ADR yang mengikat PRD ini:**

| ADR | Aturan spesifik yang wajib dipatuhi di PRD ini |
|---|---|
| `ADR-0001` B1 | Struktur workspace persis seperti yang tertulis. Arah dependency `apps → packages`, tidak pernah sebaliknya |
| `ADR-0001` B3 | UUID v7 dibangkitkan di application layer, bukan oleh database |
| `ADR-0001` B4 | Kolom uang `NUMERIC(18,4)`, kuantitas `NUMERIC(18,6)`. Belum ada di PRD ini, tapi konvensi Prisma-nya sudah harus benar |
| `ADR-0001` B5 | Semua kolom waktu `TIMESTAMPTZ` |
| `ADR-0001` B6 | `ValidationPipe` global dengan `whitelist: true` dan `forbidNonWhitelisted: true`. Validasi env pakai `zod` |
| `ADR-0001` B7 | Jest di api, Vitest di web. Integration test memakai Postgres nyata |
| `ADR-0001` B8 | Bentuk error API persis seperti spesifikasi. Dihasilkan satu filter global |
| `ADR-0001` B9 | Logger pino, JSON terstruktur, membawa `requestId`. Tidak ada rahasia di log |
| `ADR-0001` B10 | Migrasi di-commit. Seed dipisah `system` vs `demo` |
| `ADR-0002` §1 | Folder `common/` tidak boleh punya business logic |

---

## 4. User Story

```text
US-000-01

Title:   Menjalankan project dari nol
As a:    developer yang baru meng-clone repo ini
I want:  bisa menjalankan seluruh sistem dengan tiga perintah
So that: saya tidak perlu menebak urutan setup atau bertanya ke siapa pun
Priority: MVP
```

```text
US-000-02

Title:   Memastikan semua sambungan hidup
As a:    developer
I want:  satu halaman yang menunjukkan status database dan Redis
So that: kalau nanti ada yang error, saya tahu apakah masalahnya di infrastruktur
         atau di kode fitur
Priority: MVP
```

```text
US-000-03

Title:   Pagar kualitas sejak baris pertama
As a:    developer
I want:  lint, typecheck, dan test sudah terpasang dan hijau sebelum ada fitur
So that: aturan kualitas ditegakkan sejak awal, bukan ditambal setelah kode menumpuk
Priority: MVP
```

---

## 5. Business Workflow & State Machine

**Tidak berlaku** — PRD ini tidak membuat dokumen bisnis apa pun, sehingga tidak ada
state machine. State machine pertama muncul di PRD-008 (Sales Order).

---

## 6. Business Rules

**Tidak berlaku sebagai aturan bisnis** — tapi ada aturan teknis yang mengikat dan
harus diuji:

```text
BR-INFRA-001

Aplikasi API menolak untuk boot kalau ada environment variable wajib yang
tidak terisi atau tidak valid.

Berlaku saat  : startup, sebelum server menerima request pertama
Jika dilanggar: proses keluar dengan exit code bukan 0, dan mencetak daftar
                variable yang bermasalah beserta alasannya
```

```text
BR-INFRA-002

Endpoint health mengembalikan HTTP 503 kalau salah satu dependency (database
atau Redis) tidak bisa dihubungi, bukan 200 dengan pesan error di body.

Berlaku saat  : setiap pemanggilan GET /api/health
Jika dilanggar: monitoring tidak bisa membedakan sistem sehat dan sakit
```

```text
BR-INFRA-003

Request body yang memuat field yang tidak dideklarasikan di DTO ditolak
dengan 400, bukan diabaikan diam-diam.

Berlaku saat  : setiap request yang punya body
Jika dilanggar: typo nama field lolos tanpa ketahuan dan data tidak tersimpan
```

---

## 7. Data Model

### 7.1 Entity & relationship

```text
SystemSetting   (berdiri sendiri, tidak punya relasi)
```

Hanya satu tabel. Tujuannya dua: menyimpan setelan tingkat aplikasi yang memang
dibutuhkan nanti, dan **membuktikan rantai Prisma → migrasi → seed → query benar-benar
bekerja** sebelum ada tabel yang penting.

### 7.2 Definisi field

**Tabel: `system_setting`**

| Field | Tipe | Null? | Default | Unique | Keterangan |
|---|---|---|---|---|---|
| `id` | `UUID` | no | — | yes (PK) | UUID v7, dibangkitkan aplikasi |
| `key` | `VARCHAR(100)` | no | — | yes | mis. `app.version` |
| `value` | `JSONB` | no | — | no | nilainya bebas bentuk |
| `description` | `TEXT` | yes | `NULL` | no | penjelasan untuk manusia |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | no | |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | no | diperbarui otomatis |

Tabel ini **global**, bukan milik company — karena itu tidak punya `company_id`.
Ini salah satu dari empat pengecualian yang disebut `ADR-0002` §2.

**Index:** unique pada `key` (sudah otomatis dari constraint unique).

**Constraint:** `key` tidak boleh string kosong.

**Migrasi data / seed sistem** (`seed/system`, wajib ada di lingkungan mana pun):

| key | value | description |
|---|---|---|
| `app.version` | `"0.1.0"` | Versi skema aplikasi |
| `app.initialized_at` | timestamp ISO saat seed dijalankan | Kapan instance ini pertama disiapkan |

Seed harus **idempotent** — dijalankan dua kali tidak menghasilkan duplikat dan tidak
error. Pakai `upsert` berdasarkan `key`.

**Seed demo** (`seed/demo`): kosong di PRD ini, tapi file dan script-nya sudah dibuat
supaya PRD berikutnya tinggal mengisi.

---

## 8. Permission

**Tidak berlaku** — sistem permission dibangun di PRD-002, dan auth-nya di PRD-001.
Di PRD ini `GET /api/health` bersifat publik tanpa autentikasi, karena health check
harus bisa dipanggil monitoring sebelum ada user mana pun.

Yang **wajib disiapkan sekarang** supaya PRD-001 tinggal pakai: decorator `@Public()`
sudah dibuat di `common/decorators/`, walaupun guard yang membacanya belum ada.
Endpoint health ditandai `@Public()` sejak sekarang.

---

## 9. API Contract

### `GET /api/health`

- **Purpose:** memeriksa apakah API dan seluruh dependency-nya hidup
- **Authorization:** publik, tanpa autentikasi (`@Public()`)
- **Request:** tidak ada body, tidak ada parameter

- **Response 200** — semua sehat:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptimeSeconds": 4213,
  "timestamp": "2026-09-16T04:12:33.120Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "up", "latencyMs": 1 }
  }
}
```

- **Response 503** — ada dependency yang mati:

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "uptimeSeconds": 4213,
  "timestamp": "2026-09-16T04:12:33.120Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "down", "error": "connection refused" }
  }
}
```

- **Validation:** tidak ada input untuk divalidasi
- **Cara memeriksa:**
  - database — query `SystemSetting` dengan `key = 'app.version'`; nilainya sekaligus
    mengisi field `version` pada response. Ini membuktikan migrasi, seed, dan Prisma
    client bekerja, bukan sekadar koneksi TCP terbuka
  - redis — perintah `PING`, harus menjawab `PONG`
- **Timeout:** setiap pemeriksaan dibatasi 2 detik. Lewat dari itu dihitung `down`
  dengan `error: "timeout"` — health check tidak boleh ikut menggantung
- **Errors:** tidak melempar exception. Kegagalan dependency dilaporkan di body dengan
  HTTP 503
- **Side effects:** tidak ada
- **Idempotency:** ya, karena read-only

### Route yang tidak dikenal

Semua path yang tidak terdaftar mengembalikan **404 dengan bentuk error standar**
`ADR-0001` B8:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cannot GET /api/tidak-ada",
  "details": [],
  "requestId": "0192f3c1-...",
  "timestamp": "2026-09-16T04:12:33.120Z"
}
```

Ini bukan fitur tambahan — ini cara membuktikan exception filter global sudah terpasang.

---

## 10. UI/UX Requirements

Satu halaman saja: `/` di `apps/web`.

| Aspek | Ketentuan |
|---|---|
| Lokasi di navigasi | Halaman root, belum ada navigasi |
| Isi | Judul "Oddo ERP", versi aplikasi, dan kartu status untuk Database dan Redis |
| Tampilan status | Badge hijau untuk `up`, merah untuk `down`, beserta latency-nya |
| Loading state | Skeleton saat data belum datang — bukan layar kosong |
| Error state | Kalau API tidak bisa dihubungi sama sekali: pesan jelas "API tidak dapat dihubungi di `<URL>`" plus tombol "Coba lagi". Jangan menampilkan stack trace |
| Empty state | Tidak berlaku — response health selalu punya isi |
| Permission denied | Tidak berlaku — belum ada auth |
| Konfirmasi | Tidak berlaku — tidak ada aksi yang mengubah data |
| Auto-refresh | Tidak ada. Refresh manual lewat tombol |
| Responsif | Harus terbaca di lebar 400px |

Komponen shadcn/ui yang perlu dipasang di PRD ini: `card`, `badge`, `button`, `skeleton`.
Cukup itu — jangan memasang seluruh katalog.

Halaman ini akan dibuang atau dipindah ke `/health` begitu ada halaman login di PRD-001.
Karena itu **jangan membangun layout shell, sidebar, atau sistem tema di sini** — itu
pekerjaan PRD-001.

---

## 11. Edge Cases & Error Handling

| # | Skenario | Perilaku yang benar |
|---|---|---|
| 1 | Docker belum dijalankan saat `pnpm dev` | API gagal boot dengan pesan jelas menyebut `DATABASE_URL` tidak bisa dihubungi. Bukan stack trace Prisma mentah |
| 2 | `.env` belum dibuat | Validasi zod gagal, mencetak daftar variable yang kurang, exit code 1 |
| 3 | Migrasi belum dijalankan | Health check `database: down` dengan error yang menyebut tabel `system_setting` tidak ada, dan README menjelaskan jalankan `pnpm db:migrate` |
| 4 | Redis mati di tengah jalan | Health 503, API tetap merespons (tidak ikut mati) |
| 5 | Port 5432 sudah dipakai Postgres lain di mesin developer | `docker-compose.yml` memetakan Postgres ke host port **5433**, jadi tidak bentrok. `.env.example` memakai 5433 |
| 6 | Seed dijalankan dua kali | Tidak duplikat, tidak error — karena memakai `upsert` |
| 7 | Frontend jalan tapi backend mati | Halaman menampilkan error state yang ramah, bukan halaman putih atau unhandled rejection |
| 8 | Request dengan body berisi field tak dikenal | 400 `VALIDATION_ERROR` — diuji lewat controller khusus test |
| 9 | Nama file/path mengandung spasi (Windows) | Semua script memakai path relatif tanpa spasi dan tidak bergantung pada shell tertentu |

---

## 12. Audit Trail & Non-Functional

### 12.1 Audit

**Tidak berlaku** — belum ada user, belum ada data bisnis, jadi belum ada yang perlu
diaudit. Tabel `audit_log` dibuat di PRD-002.

Yang sudah harus benar sekarang: **logging** (`ADR-0001` B9). Setiap request menghasilkan
satu baris log JSON berisi `requestId`, method, path, status code, dan durasi.
`requestId` yang sama muncul di response error, sehingga keluhan bisa dilacak ke log.

### 12.2 Non-functional

| Aspek | Target |
|---|---|
| Waktu boot API (dev) | < 5 detik setelah Docker siap |
| Latency `GET /api/health` | p95 < 100 ms saat database dan Redis sehat |
| Timeout tiap pemeriksaan health | 2 detik, keras |
| Waktu `pnpm install` dari nol | tidak diukur, tapi lockfile wajib di-commit |
| Waktu `pnpm test` | < 60 detik untuk seluruh workspace |
| Transaksi DB | Tidak berlaku — belum ada tulis-menulis |
| Concurrency | Tidak berlaku |

---

## 13. Rencana Implementasi

Urutan ini disusun supaya setiap langkah bisa diverifikasi sebelum lanjut. Jangan
melompat — kalau langkah 4 gagal, penyebabnya pasti ada di langkah 1–3.

1. **Inisialisasi repo & workspace.** `git init` (kalau belum), `.gitignore`,
   `corepack enable`, `package.json` root dengan field `packageManager`,
   `pnpm-workspace.yaml`. Buat folder `apps/` dan `packages/`.
2. **`packages/config`.** `tsconfig.base.json` (strict penuh), konfigurasi ESLint
   bersama, konfigurasi Prettier. Pasang rule `import/no-restricted-paths` yang melarang
   `packages/**` mengimpor dari `apps/**`.
3. **`packages/shared`.** Buat tipe `HealthResponse`, `HealthCheckResult`, dan enum
   `ErrorCode` (isi awal: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `STATE_CONFLICT`,
   `INTERNAL_ERROR`). Ekspor lewat satu `index.ts`.
4. **`docker-compose.yml`.** PostgreSQL 16 (host port **5433**), Redis 7 (host port 6379),
   keduanya dengan named volume dan `healthcheck`. Jalankan dan pastikan keduanya hidup
   sebelum lanjut.
5. **`apps/api` kerangka NestJS.** Scaffold, sambungkan ke `packages/config` dan
   `packages/shared`. Pastikan `pnpm --filter api dev` menyala.
6. **Validasi environment.** Skema `zod` untuk `NODE_ENV`, `PORT`, `DATABASE_URL`,
   `REDIS_URL`, `WEB_ORIGIN`, `LOG_LEVEL`. Gagal keras saat boot kalau tidak valid.
   Buat `.env.example`. **Uji dengan sengaja menghapus satu variable.**
7. **Lapis `common/`.** `AllExceptionsFilter` (bentuk error `ADR-0001` B8),
   `RequestIdInterceptor` (pakai UUID v7, hormati header `X-Request-Id` kalau ada),
   `ValidationPipe` global, logger pino, decorator `@Public()`, `RequestContext`
   berbasis `AsyncLocalStorage`. CORS diizinkan hanya untuk `WEB_ORIGIN`.
8. **Prisma.** Pasang, konfigurasikan `schema.prisma`, buat model `SystemSetting`
   sesuai bagian 7.2, jalankan migrasi pertama, **commit file migrasinya**.
   Buat `PrismaService` yang menutup koneksi dengan rapi saat shutdown.
9. **Seed.** `seed/system.ts` (idempotent, isi `app.version` dan `app.initialized_at`)
   dan `seed/demo.ts` (kosong, hanya kerangka). Script `db:seed`.
10. **Modul health.** `HealthController` + `HealthService` dengan pemeriksaan database
    dan Redis, masing-masing bertimeout 2 detik. Kembalikan 200 atau 503 sesuai
    `BR-INFRA-002`.
11. **Test `apps/api`.** Jest terpasang. Unit test untuk logika penentuan
    `ok`/`degraded`. Integration test dengan Postgres nyata untuk: health 200,
    health 503 saat Redis mati, 404 berbentuk standar, dan validasi body lewat
    controller khusus test.
12. **`apps/web` kerangka Next.js.** App Router, TypeScript, Tailwind, shadcn/ui
    (hanya `card`, `badge`, `button`, `skeleton`). Sambungkan ke `packages/shared`
    dan `packages/config`.
13. **Halaman health.** Panggil `GET /api/health`, tampilkan sesuai bagian 10,
    lengkap dengan loading dan error state. Tipe response **wajib** memakai
    `HealthResponse` dari `packages/shared`, bukan tipe yang ditulis ulang.
14. **Test `apps/web`.** Vitest + Testing Library: render state loading, state sehat,
    state degraded, dan state API tidak terjangkau.
15. **Script root & README.** Semua script di bagian "Perintah" di bawah harus jalan.
    README berisi langkah setup dari nol sampai halaman health terbuka.
16. **Verifikasi akhir.** Hapus `node_modules` dan volume Docker, lalu ikuti README
    dari awal seolah-olah baru clone. Kalau ada langkah yang tidak tertulis di README,
    README-nya yang salah.

**Perintah yang harus ada di `package.json` root:**

| Script | Fungsi |
|---|---|
| `pnpm docker:up` / `docker:down` | Menyalakan/mematikan Postgres & Redis |
| `pnpm dev` | Menjalankan api dan web sekaligus |
| `pnpm build` | Build seluruh workspace |
| `pnpm test` | Test seluruh workspace |
| `pnpm lint` | ESLint seluruh workspace |
| `pnpm typecheck` | `tsc --noEmit` seluruh workspace |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | Seed sistem |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | Reset database lalu migrasi & seed ulang |

**Urutan commit yang disarankan:**
workspace & config → docker → api kerangka + env → common → prisma + migrasi + seed →
health → test api → web + halaman → test web → README.

---

## 14. Acceptance Criteria

```text
AC-000-01  Setup dari nol

Given: repo baru di-clone, Docker Desktop berjalan, dan belum ada .env
When:  developer menjalankan `pnpm install`, menyalin .env.example ke .env,
       lalu `pnpm docker:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`
Then:  http://localhost:3000 terbuka dan menampilkan status Database "up"
       dan Redis "up", tanpa langkah tambahan yang tidak tertulis di README
```

```text
AC-000-02  Health check sehat

Given: Postgres dan Redis berjalan, migrasi dan seed sudah dijalankan
When:  GET /api/health dipanggil
Then:  status HTTP 200, body.status = "ok",
       body.version = "0.1.0" (dibaca dari tabel system_setting, bukan hardcode),
       body.checks.database.status = "up",
       body.checks.redis.status = "up"
```

```text
AC-000-03  Health check saat dependency mati

Given: Postgres berjalan tetapi container Redis dihentikan
When:  GET /api/health dipanggil
Then:  status HTTP 503, body.status = "degraded",
       body.checks.redis.status = "down" dan memuat field error,
       body.checks.database.status tetap "up",
       dan proses API tetap hidup (request berikutnya masih dilayani)
```

```text
AC-000-04  Environment tidak valid

Given: variable DATABASE_URL dihapus dari .env
When:  `pnpm --filter api dev` dijalankan
Then:  proses keluar dengan exit code bukan 0 dalam waktu < 5 detik,
       dan stdout memuat nama variable "DATABASE_URL" beserta alasannya.
       Tidak ada server yang mulai mendengarkan port
```

```text
AC-000-05  Bentuk error seragam

Given: API berjalan normal
When:  GET /api/tidak-ada dipanggil
Then:  status HTTP 404 dan body memuat persis field:
       statusCode, code, message, details, requestId, timestamp
       dengan code = "NOT_FOUND"
```

```text
AC-000-06  Field tak dikenal ditolak

Given: sebuah controller khusus test yang menerima DTO dengan satu field "name"
When:  request dikirim dengan body { "name": "a", "unknownField": 1 }
Then:  status HTTP 400 dengan code = "VALIDATION_ERROR",
       dan details menyebut "unknownField"
```

```text
AC-000-07  Tipe dipakai bersama

Given: tipe HealthResponse didefinisikan di packages/shared
When:  field pada HealthResponse diubah namanya lalu `pnpm typecheck` dijalankan
Then:  typecheck GAGAL di apps/api DAN di apps/web
       (membuktikan keduanya benar-benar memakai tipe yang sama,
        bukan menuliskannya ulang masing-masing)
```

```text
AC-000-08  Seed idempotent

Given: seed sistem sudah pernah dijalankan
When:  `pnpm db:seed` dijalankan lagi
Then:  perintah selesai tanpa error, dan jumlah baris di system_setting
       tetap sama seperti sebelumnya
```

```text
AC-000-09  Pagar kualitas hijau

Given: seluruh implementasi PRD ini selesai
When:  `pnpm lint`, `pnpm typecheck`, dan `pnpm test` dijalankan
Then:  ketiganya selesai dengan exit code 0, tanpa warning yang dibiarkan
       dan tanpa test yang di-skip
```

```text
AC-000-10  Migrasi tercatat di repo

Given: model SystemSetting sudah dibuat
When:  isi folder prisma/migrations diperiksa
Then:  ada minimal satu folder migrasi berisi migration.sql yang tidak di-gitignore,
       dan `pnpm db:reset` berhasil membangun ulang database dari nol
```

```text
AC-000-11  Halaman web menangani backend mati

Given: apps/web berjalan tetapi apps/api dihentikan
When:  http://localhost:3000 dibuka
Then:  halaman menampilkan pesan bahwa API tidak dapat dihubungi beserta URL-nya
       dan sebuah tombol "Coba lagi".
       Tidak ada halaman putih, tidak ada stack trace yang terlihat user
```

---

## 15. Test Plan

| Level | Yang diuji | Catatan |
|---|---|---|
| Unit (api) | Fungsi yang menentukan `ok` vs `degraded` dari hasil pemeriksaan | Murni, tanpa DB |
| Unit (api) | Skema validasi env: kasus valid, kasus kurang variable, kasus format URL salah | |
| Integration (api) | `GET /api/health` → 200 dengan Postgres & Redis nyata | Postgres dari Docker, bukan mock |
| Integration (api) | `GET /api/health` → 503 saat Redis tidak terjangkau | Arahkan `REDIS_URL` ke port mati |
| Integration (api) | Route tak dikenal → 404 berbentuk standar | Menguji exception filter |
| Integration (api) | Body dengan field tak dikenal → 400 | Lewat controller khusus test, bukan route produksi |
| Unit (web) | Render state loading, sehat, degraded, dan API tak terjangkau | Vitest + Testing Library, `fetch` di-mock |

**Data uji / fixture yang dibutuhkan:**
seed sistem (`app.version`, `app.initialized_at`). Tidak ada fixture lain.

**Catatan penting:** integration test **tidak boleh** memakai database yang sama dengan
development. Pakai database terpisah (mis. `oddo_test`) yang di-migrate dan dibersihkan
sebelum setiap run. Tuliskan caranya di README.

---

## 16. Definition of Done

- [ ] Semua AC di bagian 14 lulus
- [ ] Test unit + integration ditulis dan hijau (`pnpm test` exit 0)
- [ ] Permission & record rule — **tidak berlaku di PRD ini**, tapi `@Public()`
      sudah tersedia di `common/decorators/`
- [ ] Audit log — **tidak berlaku di PRD ini**; logging terstruktur sudah jalan
      dan membawa `requestId`
- [ ] Error state & validasi sesuai bagian 9 dan 11
- [ ] `pnpm lint` dan `pnpm typecheck` bersih
- [ ] `README.md` berisi langkah setup dari nol dan sudah diuji ulang dari kondisi bersih
- [ ] `.env.example` lengkap dan cocok dengan skema validasi
- [ ] File migrasi Prisma di-commit
- [ ] Bagian "Perintah penting" di `CLAUDE.md` diisi dengan script yang benar-benar ada
- [ ] `docs/prd/README.md` diperbarui
- [ ] Bagian "Catatan Coder" di bawah diisi

---

## Open Questions

> Diisi oleh sesi Coder saat menemukan ambiguitas. Jangan menebak — set `status: blocked`.
> Dijawab oleh sesi Mentor langsung di kolom sebelahnya.

| # | Pertanyaan | Diajukan oleh | Jawaban Mentor | Tanggal |
|---|---|---|---|---|
| | | | | |

---

## Catatan Coder

> Diisi oleh sesi Coder setelah implementasi selesai.

**Ringkasan yang dikerjakan:**

**File yang dibuat/diubah:**

**Deviasi dari PRD (kalau ada) + alasannya:**

**Hal yang perlu diputuskan Mentor untuk PRD berikutnya:**

**Cara menjalankan & menguji:**
