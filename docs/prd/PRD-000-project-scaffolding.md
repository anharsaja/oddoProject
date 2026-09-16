---
id: PRD-000
title: Project scaffolding — monorepo, Docker, Prisma, health check
status: review
priority: P0
modules: [infra]
depends_on: []
blocks: [PRD-001]
estimasi: ~8 jam / 1 sesi coder — checkpoint wajib setelah langkah 11
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
- [ ] `docker-compose.yml` berisi PostgreSQL 16 dan Redis 7 dengan volume persisten,
      `healthcheck`, dan script init yang menyiapkan database `oddo_dev` **dan** `oddo_test`
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
- [ ] `.env.example` + `.env.test` lengkap, dan `README.md` berisi cara menjalankan dari nol
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

### 2.4 Konvensi tetap — nilai konkret, bukan saran

Nilai-nilai berikut **ditetapkan di sini** dan dipakai selamanya oleh seluruh PRD
berikutnya. Jangan diganti tanpa ADR baru.

**Nama package** (field `name` di tiap `package.json`):

| Lokasi | `name` | Dipanggil dengan |
|---|---|---|
| `apps/api` | `@oddo/api` | `pnpm --filter @oddo/api <script>` |
| `apps/web` | `@oddo/web` | `pnpm --filter @oddo/web <script>` |
| `packages/shared` | `@oddo/shared` | `import { HealthResponse } from '@oddo/shared'` |
| `packages/config` | `@oddo/config` | di-extend oleh `tsconfig.json` & `eslint.config.js` |

Root `package.json` diberi `"name": "oddo"` dan `"private": true`.
Perhatikan: karena nama package ber-scope, filter **wajib** memakai nama lengkap —
`pnpm --filter api` tidak akan cocok dengan `@oddo/api`.

**Port dan URL:**

| Yang mana | Nilai | Keterangan |
|---|---|---|
| `apps/api` | **3001** | default `PORT`, boleh ditimpa lewat env |
| `apps/web` | **3000** | default Next.js |
| PostgreSQL (host) | **5433** | sengaja bukan 5432, lihat §11 no. 5 |
| Redis (host) | **6379** | |
| Global prefix API | **`/api`** | dipasang lewat `setGlobalPrefix('api')`, sehingga URL penuhnya `http://localhost:3001/api/health` |

**Environment variable:**

| Variable | Milik | Contoh nilai di `.env.example` | Wajib? |
|---|---|---|---|
| `NODE_ENV` | api | `development` | ya |
| `PORT` | api | `3001` | ya |
| `DATABASE_URL` | api | `postgresql://oddo:oddo@localhost:5433/oddo_dev?schema=public` | ya |
| `REDIS_URL` | api | `redis://localhost:6379/0` | ya |
| `WEB_ORIGIN` | api | `http://localhost:3000` | ya |
| `LOG_LEVEL` | api | `debug` | ya |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:3001/api` | ya |

`NEXT_PUBLIC_API_URL` inilah URL yang ditampilkan halaman web saat API tidak bisa
dihubungi (AC-000-11). Nilainya dibaca sekali di satu modul konfigurasi, bukan disebar
sebagai `process.env` di banyak komponen.

**Database:** container Postgres menyediakan **dua** database sejak awal —
`oddo_dev` untuk development dan `oddo_test` untuk integration test. Lihat §13 langkah 4.

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

**Kenapa tabel ini tidak memakai base fields lengkap `ADR-0002` §4 — ini disengaja,
bukan kelalaian. Jangan tambahkan sendiri.**

| Field base yang tidak ada | Alasan |
|---|---|
| `company_id` | `system_setting` adalah setelan tingkat **instance**, bukan milik company. Ini salah satu dari empat pengecualian yang sudah disebut `ADR-0002` §2 |
| `created_by`, `updated_by` | Keduanya foreign key ke tabel `user`, dan **tabel `user` belum ada** — baru dibuat di PRD-001. FK ke tabel yang belum ada tidak mungkin. Baris seed juga tidak dibuat oleh user mana pun, melainkan oleh proses sistem |
| `active` | Setelan sistem tidak punya siklus hidup "diarsipkan". Setelan yang tidak berlaku lagi dihapus barisnya, dan tidak ada dokumen lain yang menunjuk ke sini |

`ADR-0002` §4 berbunyi "wajib di setiap **tabel bisnis**". `system_setting` bukan tabel
bisnis — tidak ada user yang mengelolanya lewat layar, tidak ada dokumen yang
mereferensikannya. Klarifikasi ini sudah ditambahkan ke `ADR-0002` §4 supaya PRD
berikutnya tidak menghadapi keraguan yang sama.

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
- **Health sengaja TIDAK memakai bentuk error `ADR-0001` B8.** Perhatikan body 503 di
  atas: bentuknya `{status, version, uptimeSeconds, timestamp, checks}`, bukan
  `{statusCode, code, message, details, requestId, timestamp}`. Ini bukan
  ketidakkonsistenan — 503 di sini berarti "sistem sedang sakit", bukan "request Anda
  salah", dan monitoring butuh melihat *dependency mana* yang mati.
  **Implementasinya:** controller menulis status code langsung ke response
  (`@Res({ passthrough: true })` lalu `res.status(503)`, atau `@HttpCode` dinamis) dan
  mengembalikan objek biasa. **Jangan** melempar `ServiceUnavailableException` — kalau
  dilempar, `AllExceptionsFilter` akan membungkusnya jadi bentuk B8 dan AC-000-03 gagal
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
   keduanya dengan named volume dan `healthcheck`.
   - Postgres wajib menyiapkan **dua database**: `oddo_dev` dan `oddo_test`. Caranya:
     mount script `docker/postgres/init/01-create-databases.sh` ke
     `/docker-entrypoint-initdb.d/` — image resmi Postgres menjalankan isi folder itu
     sekali saat volume pertama dibuat. Script membuat `oddo_test` (database `oddo_dev`
     dibuat lewat `POSTGRES_DB`).
   - Karena script init hanya jalan saat volume **kosong**: kalau volume sudah terlanjur
     ada tanpa `oddo_test`, jalankan `pnpm docker:down -v` lalu `pnpm docker:up`.
     Tulis catatan ini di README.
   - Redis memakai index database berbeda untuk memisahkan test dari development:
     `/0` untuk dev, `/1` untuk test.
   - `pnpm docker:up` **wajib menunggu sampai healthcheck hijau** (`docker compose up -d
     --wait`), bukan langsung kembali. Tanpa ini, `db:migrate` yang dijalankan sesudahnya
     gagal secara acak karena Postgres belum siap menerima koneksi.
5. **`apps/api` kerangka NestJS.** Scaffold dengan `name: "@oddo/api"`, sambungkan ke
   `@oddo/config` dan `@oddo/shared`. Pasang `setGlobalPrefix('api')`.
   Pastikan `pnpm --filter @oddo/api dev` menyala di port 3001.
6. **Validasi environment.** Skema `zod` untuk keenam variable milik api di §2.4
   (`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `WEB_ORIGIN`, `LOG_LEVEL`).
   Gagal keras saat boot kalau tidak valid. Buat `.env.example` **dan** `.env.test`
   (isinya sama, kecuali `DATABASE_URL` menunjuk `oddo_test` dan `REDIS_URL` ke `/1`).
   **Uji dengan sengaja menghapus satu variable.**
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
11. **Test `apps/api`.** Jest terpasang, memuat `.env.test` sehingga memakai database
    `oddo_test` dan Redis index `/1`. Setup test menjalankan `prisma migrate deploy` ke
    `oddo_test` sekali di awal, lalu membersihkan tabel sebelum tiap file test.
    - Unit: logika penentuan `ok` vs `degraded`; skema validasi env.
    - Integration: health 200; health 503 dengan `REDIS_URL` diarahkan ke port mati;
      404 berbentuk standar; body dengan field tak dikenal → 400 lewat controller
      khusus test.

> ### ⛳ CHECKPOINT — berhenti di sini kalau sesi harus dipotong
>
> Setelah langkah 11, seluruh backend beserta test-nya sudah hijau dan bisa di-commit
> sebagai satu kesatuan yang utuh. Kalau waktu/konteks sesi menipis, **berhenti di sini**,
> commit, isi bagian "Catatan Coder" dengan menyebut langkah 12–16 belum dikerjakan,
> dan set `status: review`. Jangan berhenti di tengah wiring Next.js — itu meninggalkan
> workspace yang tidak bisa di-build.

12. **`apps/web` kerangka Next.js.** `name: "@oddo/web"`, App Router, TypeScript,
    Tailwind, shadcn/ui (hanya `card`, `badge`, `button`, `skeleton`). Sambungkan ke
    `@oddo/shared` dan `@oddo/config`.
13. **Halaman health.** Panggil `GET /api/health` lewat `NEXT_PUBLIC_API_URL`,
    tampilkan sesuai bagian 10, lengkap dengan loading dan error state. Tipe response
    **wajib** memakai `HealthResponse` dari `@oddo/shared`, bukan tipe yang ditulis ulang.
14. **Test `apps/web`.** Vitest + Testing Library: render state loading, state sehat,
    state degraded, dan state API tidak terjangkau.
15. **Script root & README.** Semua script di bagian "Perintah" di bawah harus jalan.
    README berisi langkah setup dari nol sampai halaman health terbuka.
16. **Verifikasi akhir.** Hapus `node_modules` dan volume Docker, lalu ikuti README
    dari awal seolah-olah baru clone. Kalau ada langkah yang tidak tertulis di README,
    README-nya yang salah.

**Perintah yang harus ada di `package.json` root:**

| Script | Fungsi | Catatan wajib |
|---|---|---|
| `pnpm docker:up` | Menyalakan Postgres & Redis | **Wajib** `docker compose up -d --wait` — harus menunggu healthcheck hijau |
| `pnpm docker:down` | Mematikan keduanya | `docker:down -v` (ikut menghapus volume) harus tetap bisa dijalankan |
| `pnpm dev` | Menjalankan api dan web sekaligus | |
| `pnpm build` | Build seluruh workspace | |
| `pnpm test` | Test seluruh workspace | Memakai `oddo_test`, bukan `oddo_dev` |
| `pnpm lint` | ESLint seluruh workspace | **Wajib** `--max-warnings=0` — warning diperlakukan sebagai kegagalan |
| `pnpm typecheck` | `tsc --noEmit` seluruh workspace | |
| `pnpm db:migrate` | `prisma migrate dev` ke `oddo_dev` | |
| `pnpm db:seed` | Seed sistem ke `oddo_dev` | |
| `pnpm db:studio` | Prisma Studio | |
| `pnpm db:reset` | Reset `oddo_dev` lalu migrasi & seed ulang | |

**Urutan commit yang disarankan:**
workspace & config → docker → api kerangka + env → common → prisma + migrasi + seed →
health → test api → web + halaman → test web → README.

---

## 14. Acceptance Criteria

```text
AC-000-01  Setup dari nol

Given: repo baru di-clone, Docker Desktop berjalan, dan belum ada .env
When:  developer menjalankan persis urutan ini tanpa jeda manual di antaranya:
         pnpm install
         (salin .env.example -> .env)
         pnpm docker:up
         pnpm db:migrate
         pnpm db:seed
         pnpm dev
Then:  http://localhost:3000 terbuka dan menampilkan status Database "up"
       dan Redis "up", tanpa langkah tambahan yang tidak tertulis di README.
       `pnpm db:migrate` TIDAK BOLEH gagal karena Postgres belum siap — `docker:up`
       sudah menunggu healthcheck. Jalankan urutan ini 3x dari volume kosong;
       ketiganya harus berhasil (menguji bahwa tidak ada race)
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

Bukti yang mengikat adalah integration test OTOMATIS (huruf a).
Pemeriksaan manual (huruf b) sifatnya smoke check, boleh dilakukan sekali.

(a) OTOMATIS — ini yang menentukan lulus/tidak
Given: aplikasi di-boot di dalam test dengan REDIS_URL diarahkan ke port yang
       tidak ada yang mendengarkan (mis. redis://localhost:6399/1),
       sementara Postgres normal
When:  GET /api/health dipanggil lewat Supertest
Then:  status HTTP 503, body.status = "degraded",
       body.checks.redis.status = "down" dan punya field error non-kosong,
       body.checks.database.status tetap "up",
       body TIDAK berbentuk error ADR-0001 B8 (tidak ada field "code"),
       dan request kedua ke endpoint yang sama masih dilayani (proses tidak mati)

(b) MANUAL — smoke check
Given: sistem berjalan normal
When:  `docker compose stop redis` lalu GET http://localhost:3001/api/health
Then:  hasil yang sama seperti (a)
```

```text
AC-000-04  Environment tidak valid

Given: variable DATABASE_URL dihapus dari .env
When:  `pnpm --filter @oddo/api dev` dijalankan
Then:  proses keluar dengan exit code bukan 0 dalam waktu < 5 detik,
       dan stdout memuat nama variable "DATABASE_URL" beserta alasannya.
       Tidak ada server yang mulai mendengarkan port 3001
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

Dibuktikan dua cara: satu guard otomatis, satu prosedur manual yang hasilnya
ditempel sebagai bukti.

(a) OTOMATIS — guard permanen
Given: implementasi selesai
When:  `pnpm test` dijalankan
Then:  ada satu test yang memindai isi apps/** dan GAGAL kalau menemukan
       deklarasi lokal bernama HealthResponse atau HealthCheckResult
       (pola "interface HealthResponse", "type HealthResponse", dan dua
        padanannya untuk HealthCheckResult). Test ini lulus pada kode final

(b) MANUAL — prosedur sekali jalan, buktinya wajib ditempel
Given: HealthResponse hanya dideklarasikan di packages/shared
When:  Coder menjalankan prosedur ini persis:
         1. ubah nama field `checks` menjadi `checksRenamed` di @oddo/shared
         2. jalankan `pnpm typecheck`
         3. salin keluaran error-nya
         4. kembalikan perubahan langkah 1
Then:  keluaran dari langkah 3 memuat error yang berasal dari @oddo/api
       DAN dari @oddo/web (dua-duanya, bukan salah satu),
       keluaran itu ditempel di bagian "Catatan Coder" dokumen ini,
       dan setelah langkah 4 `pnpm typecheck` kembali exit code 0
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
Then:  ketiganya selesai dengan exit code 0, DAN:
       - `pnpm lint` dijalankan dengan `--max-warnings=0`, sehingga exit 0
         berarti nol error DAN nol warning
       - tidak ada aturan ESLint yang dimatikan lewat komentar inline
         (`eslint-disable`) tanpa alasan tertulis di baris yang sama
       - laporan `pnpm test` menunjukkan 0 skipped dan 0 todo
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
Then:  halaman menampilkan pesan bahwa API tidak dapat dihubungi, dan pesan itu
       memuat nilai NEXT_PUBLIC_API_URL apa adanya (http://localhost:3001/api),
       beserta sebuah tombol "Coba lagi".
       Tidak ada halaman putih, tidak ada stack trace yang terlihat user
```

```text
AC-000-12  Test terpisah dari database development

Given: `oddo_dev` sudah berisi hasil `pnpm db:seed`
When:  `pnpm test` dijalankan sampai selesai
Then:  isi `oddo_dev` tidak berubah sama sekali (jumlah baris system_setting
       dan nilainya tetap), karena integration test memakai `oddo_test`.
       Menjalankan `pnpm test` dua kali berturut-turut sama-sama hijau
       tanpa perlu membersihkan database secara manual
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
| Guard (api) | Tidak ada deklarasi lokal `HealthResponse` / `HealthCheckResult` di `apps/**` | Memindai file, bukan menjalankan kode. Mendukung AC-000-07 (a) |
| Unit (web) | Render state loading, sehat, degraded, dan API tak terjangkau | Vitest + Testing Library, `fetch` di-mock |

**Data uji / fixture yang dibutuhkan:**
seed sistem (`app.version`, `app.initialized_at`). Tidak ada fixture lain.

**Isolasi database test — sudah ditetapkan, bukan pilihan Coder:**

| Aspek | Nilai |
|---|---|
| Database | `oddo_test`, dibuat oleh script init Postgres di §13 langkah 4 |
| Redis | index `/1` (development memakai `/0`) |
| Sumber env | `.env.test`, dimuat otomatis oleh konfigurasi Jest |
| Persiapan | `prisma migrate deploy` ke `oddo_test` sekali di global setup |
| Pembersihan | `TRUNCATE` tabel yang dipakai sebelum tiap file test — bukan `migrate reset`, supaya cepat |

Integration test **tidak boleh** menyentuh `oddo_dev`. Dibuktikan oleh AC-000-12.

**Cara mematikan Redis di dalam test:** arahkan `REDIS_URL` ke port yang tidak
didengarkan siapa pun (mis. `redis://localhost:6399/1`) saat membangun testing module.
**Jangan** menghentikan container dari dalam test — test tidak boleh bergantung pada
Docker CLI, dan menghentikan container akan mengganggu test lain yang berjalan bersamaan.

---

## 16. Definition of Done

- [ ] Semua AC di bagian 14 lulus
- [ ] Test unit + integration ditulis dan hijau (`pnpm test` exit 0)
- [ ] Permission & record rule — **tidak berlaku di PRD ini**, tapi `@Public()`
      sudah tersedia di `common/decorators/`
- [ ] Audit log — **tidak berlaku di PRD ini**; logging terstruktur sudah jalan
      dan membawa `requestId`
- [ ] Error state & validasi sesuai bagian 9 dan 11
- [ ] `pnpm lint` (dengan `--max-warnings=0`) dan `pnpm typecheck` bersih
- [ ] `README.md` berisi langkah setup dari nol dan sudah diuji ulang dari kondisi bersih,
      termasuk catatan "kalau volume Postgres sudah ada tanpa `oddo_test`, jalankan
      `pnpm docker:down -v`"
- [ ] `.env.example` dan `.env.test` lengkap dan cocok dengan skema validasi
- [ ] Keluaran typecheck dari prosedur AC-000-07 (b) sudah ditempel di "Catatan Coder"
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

Seluruh bagian 13 (langkah 1–16) dikerjakan. Monorepo pnpm berisi `@oddo/api` (NestJS),
`@oddo/web` (Next.js), `@oddo/shared`, dan `@oddo/config`; PostgreSQL 16 + Redis 7 lewat
Docker dengan healthcheck dan script init yang membuat `oddo_dev` **dan** `oddo_test`;
Prisma tersambung dengan dua file migrasi yang di-commit dan seed sistem yang idempotent;
endpoint `GET /api/health` yang memeriksa database dan Redis sungguhan dengan timeout 2 detik;
serta halaman web yang menampilkan hasilnya lengkap dengan loading, degraded, dan error state.

Pendekatan yang perlu diketahui Mentor:

1. **Wiring aplikasi dipisah ke `src/app.setup.ts`** (fungsi `configureApp`). `main.ts` dan
   seluruh integration test memakai fungsi yang sama, sehingga filter/pipe/interceptor yang
   diuji benar-benar sama dengan yang dipakai production. Filter yang hanya dipasang di
   `main.ts` adalah filter yang tidak pernah dilihat test.
2. **Request id lahir di satu tempat**, yaitu hook `genReqId` milik pino-http — karena itu
   middleware, ia juga berjalan untuk request yang tidak cocok ke route mana pun (404).
   `RequestIdInterceptor` memakai ulang nilai itu, mengisi `RequestContext`
   (AsyncLocalStorage), dan mencerminkannya ke response header.
3. **Health sengaja membaca satu baris nyata** (`system_setting.key = 'app.version'`), bukan
   `SELECT 1`. Koneksi TCP yang terbuka tidak membuktikan migrasi sudah jalan atau Prisma
   client cocok dengan skema — dan justru itu kegagalan yang benar-benar terjadi.
4. **`@oddo/shared` di-build ke `dist/`** dan script root menjalankan `build:shared` sebelum
   `typecheck`/`test`/`build`. Itulah yang membuat AC-000-07 (b) bekerja: mengubah sumber
   tipe langsung terasa di kedua aplikasi tanpa langkah manual.

---

**File yang dibuat/diubah:**

*Root & workspace*

| Path | Peran |
|---|---|
| `package.json` | Script orkestrasi root, `packageManager: pnpm@9.15.4` |
| `pnpm-workspace.yaml` | Mendaftarkan `apps/*` dan `packages/*` |
| `eslint.config.mjs` | Flat config seluruh workspace; satu-satunya tempat `pnpm lint` berjalan |
| `prettier.config.mjs`, `.prettierignore` | Prettier; `**/*.md` diabaikan agar dokumen milik Mentor tidak ikut diformat |
| `.gitignore`, `.gitattributes` | `.env` diabaikan, `prisma/migrations` tidak; `*.sh` dipaksa LF supaya script init jalan di container |
| `.env.example`, `.env.test` | Satu file env di root untuk api **dan** web |
| `docker-compose.yml` | Postgres 16 (host **5433**) + Redis 7, keduanya dengan healthcheck |
| `docker/postgres/init/01-create-databases.sh` | Membuat `oddo_test` saat volume pertama dibuat |
| `README.md` | Setup dari nol, daftar perintah, troubleshooting |
| `CLAUDE.md` | Bagian "Perintah penting" diisi (hanya bagian itu yang disentuh) |

*`packages/`*

| Path | Peran |
|---|---|
| `packages/config/tsconfig.base.json` | TS strict penuh (termasuk `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `packages/config/eslint.base.mjs` | Aturan bersama + zona `import/no-restricted-paths` (`packages/**` dilarang mengimpor `apps/**`) + larangan `console` di kode aplikasi |
| `packages/config/prettier.config.mjs` | Gaya kode bersama |
| `packages/shared/src/health.ts` | `HealthResponse`, `HealthCheckResult`, `HealthStatus`, `DependencyStatus` |
| `packages/shared/src/error-code.ts` | Enum `ErrorCode` (ADR-0001 B8) |

*`apps/api/`*

| Path | Peran |
|---|---|
| `src/main.ts` | Bootstrap; memvalidasi env sebelum Nest dibangun |
| `src/app.module.ts`, `src/app.setup.ts` | Modul root dan wiring bersama (prefix `/api`, pipe, filter, interceptor, CORS) |
| `src/config/env.schema.ts` | Skema zod + `EnvValidationError` + formatter laporan |
| `src/config/env.ts` | Memuat `.env` root, cache, `loadEnvOrExit()` |
| `src/config/env.module.ts` | Token DI `ENV` (global) |
| `src/config/check-env.ts` | Gerbang env berdiri sendiri untuk `pnpm dev` (lihat deviasi D-2) |
| `src/common/request-id.ts` | `resolveRequestId()` — hormati `X-Request-Id`, kalau tidak ada buat UUID v7 |
| `src/common/context/request-context.ts` | `RequestContext` berbasis AsyncLocalStorage |
| `src/common/interceptors/request-id.interceptor.ts` | Mengisi context + header response |
| `src/common/filters/all-exceptions.filter.ts` | Satu-satunya perakit body error (ADR-0001 B8) |
| `src/common/validation/validation-exception.factory.ts` | Menerjemahkan class-validator ke `details[]` |
| `src/common/api-error.ts` | Kontrak `ApiErrorResponse` + pemetaan status ke `ErrorCode` |
| `src/common/logging/logger.options.ts` | Opsi pino; redact cookie/authorization; `genReqId` |
| `src/common/prisma/*` | `PrismaService` (pesan koneksi yang jelas, disconnect rapi) + modul global |
| `src/common/redis/*` | `RedisService` (ping, teardown deterministik) + modul global |
| `src/common/with-timeout.ts` | `withTimeout()` + `describeError()` |
| `src/common/decorators/public.decorator.ts` | `@Public()` — disiapkan untuk guard PRD-001 |
| `src/health/health.status.ts` | Fungsi murni `resolveOverallStatus()` (ok vs degraded) |
| `src/health/health.service.ts` | Probe database & Redis, masing-masing bertimeout 2 detik |
| `src/health/health.controller.ts` | 200/503 ditulis langsung ke response, bukan lewat exception |
| `prisma/schema.prisma` | Model `SystemSetting` + catatan konvensi Decimal/Timestamptz |
| `prisma/migrations/20260916062502_init_system_setting/` | Tabel `system_setting` |
| `prisma/migrations/20260916063000_system_setting_key_not_empty/` | CHECK `key` tidak boleh kosong (ditulis tangan) |
| `prisma/seed/system.ts`, `index.ts`, `demo.ts` | Seed sistem idempotent; seed demo masih kerangka |
| `jest.config.ts`, `test/*.ts` | Jest + `.env.test` + `migrate deploy` ke `oddo_test` + TRUNCATE per file |
| `src/**/*.spec.ts`, `test/**/*.spec.ts` | 30 test (unit + integration + guard) |

*`apps/web/`*

| Path | Peran |
|---|---|
| `next.config.ts` | Memuat `.env` root, gagal keras kalau `NEXT_PUBLIC_API_URL` kosong |
| `tailwind.config.ts`, `src/app/globals.css` | Token warna secukupnya untuk 4 komponen shadcn |
| `src/lib/config.ts` | **Satu-satunya** pembaca `NEXT_PUBLIC_API_URL` |
| `src/lib/utils.ts` | `cn()` |
| `src/components/ui/{card,badge,button,skeleton}.tsx` | Komponen shadcn/ui yang dipasang |
| `src/components/health-dashboard.tsx` | Loading / sehat / degraded / tidak terjangkau + tombol muat ulang |
| `src/app/layout.tsx`, `src/app/page.tsx` | Halaman root, tanpa layout shell (sengaja) |
| `vitest.config.ts`, `test/*` | Vitest + Testing Library, 6 test |

---

**Bukti Acceptance Criteria:**

| AC | Terpenuhi? | Bukti |
|---|---|---|
| AC-000-01 Setup dari nol | ya | Urutan `docker:reset` → `docker:up` → `db:migrate` → `db:seed` dijalankan **3x** dari volume kosong, ketiganya exit 0 (14 s, 14 s, dan iterasi ke-3 dilanjut `pnpm dev`). Iterasi 3: api dan web keduanya HTTP 200 dalam 2 detik; `GET /api/health` mengembalikan `status: ok` dengan database dan redis `up`. Tidak ada race karena `docker:up` memakai `--wait` |
| AC-000-02 Health sehat | ya | `test/health.spec.ts` — "answers 200 with both dependencies up". Bahwa `version` benar-benar dari DB dibuktikan test "reads version from system_setting instead of hardcoding it": baris diubah jadi `9.9.9-from-database`, response ikut berubah |
| AC-000-03 Dependency mati | ya | (a) `test/health-degraded.spec.ts` 4 test: 503 + `degraded`, `redis.status=down` dengan `error` non-kosong, `database` tetap `up`, body **tidak** punya field `code`/`statusCode`/`details`, dan request kedua tetap dilayani. (b) manual: `docker compose stop redis` memberi 503 `degraded` dengan error `Stream isn't writeable and enableOfflineQueue options is false`; setelah `docker compose start redis` kembali 200 sendiri |
| AC-000-04 Environment tidak valid | ya | `DATABASE_URL` dihapus dari `.env`, lalu `pnpm --filter @oddo/api dev` memberi **exit code 1 dalam 2 detik**, stdout memuat `- DATABASE_URL: is missing`, dan curl ke port 3001 mengembalikan `000` (tidak ada yang mendengarkan) |
| AC-000-05 Bentuk error seragam | ya | `test/error-envelope.spec.ts` — `Object.keys(body).sort()` dicocokkan persis ke `[code, details, message, requestId, statusCode, timestamp]`, `code = NOT_FOUND`, `message = Cannot GET /api/tidak-ada`. Dicek manual juga lewat curl |
| AC-000-06 Field tak dikenal | ya | `test/error-envelope.spec.ts` — controller khusus test `ValidationProbeController` (hanya hidup di file test); body `{name:'a', unknownField:1}` memberi 400 `VALIDATION_ERROR` dan `details` memuat `field: unknownField` |
| AC-000-07 Tipe dipakai bersama | ya | (a) `test/shared-types.guard.spec.ts` memindai `apps/**`. Guard-nya sendiri **diuji bisa gagal**: file berisi `interface HealthResponse` ditaruh sengaja, test merah dan menyebut path-nya; dihapus, hijau lagi. (b) prosedur manual dijalankan, keluarannya ditempel di bawah |
| AC-000-08 Seed idempotent | ya | `pnpm db:seed` dijalankan dua kali; `count(*)` **dan** md5 seluruh isi tabel identik (`2 rows / 42a97fba4383cce20abaea798e14614e`) |
| AC-000-09 Pagar kualitas | ya | `pnpm lint` (`--max-warnings=0`), `pnpm typecheck`, `pnpm test` semuanya exit 0. Laporan test: `Tests: 30 passed, 30 total` (api) + `Test Files 1 passed`, 6 test (web) — **0 skipped, 0 todo**. Tidak ada satu pun `eslint-disable` di seluruh repo. Bahwa lint benar-benar memindai `.tsx` dibuktikan dengan menyisipkan variabel tak terpakai di `page.tsx` sampai lint merah |
| AC-000-10 Migrasi tercatat | ya | `git check-ignore` atas `migration.sql` menunjukkan file tidak diabaikan. `pnpm db:reset` (atas persetujuan owner) exit 0: kedua migrasi ter-apply ulang, CHECK constraint ikut terbentuk, seed jalan lagi |
| AC-000-11 Backend mati | ya | `test/health-dashboard.test.tsx` — "reports an unreachable API with its URL and a retry button": pesan memuat nilai `API_URL` apa adanya dan tombol "Coba lagi" ada. Manual: API dimatikan, `http://localhost:3000` tetap HTTP 200 tanpa stack trace; bundle klien yang terkirim memuat pesan itu beserta `http://localhost:3001/api` |
| AC-000-12 Test terpisah dari dev | ya | `oddo_dev` di-hash sebelum dan sesudah seluruh test: `2 rows / 42a97fba...` identik. `pnpm test` dijalankan dua kali berturut-turut, keduanya exit 0 (20 detik) tanpa pembersihan manual |

**Keluaran AC-000-07 (b)** — field `checks` diubah jadi `checksRenamed` di
`packages/shared/src/health.ts`, lalu `pnpm typecheck`. Error muncul dari **kedua** aplikasi:

```
> @oddo/web@0.1.0 typecheck E:\Project\oddoProject\apps\web
src/components/health-dashboard.tsx(106,67): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
src/components/health-dashboard.tsx(107,64): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
test/health-dashboard.test.tsx(14,5): error TS2353: Object literal may only specify known properties, and 'checks' does not exist in type 'HealthResponse'.
test/health-dashboard.test.tsx(78,9): error TS2353: Object literal may only specify known properties, and 'checks' does not exist in type 'Partial<HealthResponse>'.

> @oddo/api@0.1.0 typecheck E:\Project\oddoProject\apps\api
src/health/health.service.ts(47,7): error TS2353: Object literal may only specify known properties, and 'checks' does not exist in type 'HealthResponse'.
test/health-degraded.spec.ts(47,17): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
test/health-degraded.spec.ts(48,24): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
test/health.spec.ts(39,17): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
test/health.spec.ts(40,17): error TS2339: Property 'checks' does not exist on type 'HealthResponse'.
... 18 error seluruhnya, semuanya akibat satu rename

ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @oddo/web@0.1.0 typecheck: `tsc -p tsconfig.json --noEmit`
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @oddo/api@0.1.0 typecheck: `tsc -p tsconfig.json --noEmit`
```

Setelah rename dikembalikan: `pnpm typecheck` memberi **exit code 0**.

---

**Deviasi dari PRD + alasannya:**

| # | Deviasi | Alasan | Dampak |
|---|---|---|---|
| D-1 | `.env.test` memakai `NODE_ENV=test`, bukan `development` | §13 langkah 6 menyebut isinya sama dengan `.env.example` kecuali `DATABASE_URL` dan `REDIS_URL`. Diturut harfiah, `NODE_ENV` akan bernilai `development` saat test — itu menyalakan transport pino-pretty di dalam test dan membuat lingkungan test berbohong tentang dirinya sendiri | Tidak ada AC yang terpengaruh. `LOG_LEVEL` tetap `debug` persis seperti PRD |
| D-2 | `pnpm --filter @oddo/api dev` sekarang `run-s check:env dev:watch`, bukan langsung `nest start --watch` | AC-000-04 menuntut proses **keluar** dengan exit code bukan 0. `nest start --watch` tidak pernah keluar — itu memang sifat watcher: aplikasinya mati, watcher-nya tetap hidup (terbukti: harus dibunuh timeout, exit 124). Validasi env dijalankan lebih dulu sebagai proses terpisah | AC-000-04 terpenuhi (exit 1 dalam 2 detik) **dan** hot reload tetap jalan saat env valid |
| D-3 | Ditambahkan script `pnpm docker:reset` | Alias eksplisit untuk `docker compose down -v`. Bentuk `pnpm docker:down -v` yang ditulis PRD **juga diuji dan berfungsi** (flag diteruskan pnpm) — keduanya didokumentasikan di README | Tidak ada; murni tambahan kenyamanan |
| D-4 | Migrasi jadi **dua** file, bukan satu | CHECK constraint "key tidak boleh kosong" (§7.2) tidak bisa diekspresikan di `schema.prisma`. Menempelkannya ke migrasi pertama yang sudah ter-apply akan mengubah checksum-nya. ADR-0001 B10 sendiri mengizinkan satu PRD menghasilkan lebih dari satu migrasi | Tidak ada; `db:reset` membangun keduanya dari nol dengan benar |
| D-5 | `ApiErrorResponse` disimpan di `apps/api/src/common/api-error.ts`, bukan di `@oddo/shared` | §13 langkah 3 hanya menyebut tiga hal untuk `@oddo/shared`: `HealthResponse`, `HealthCheckResult`, `ErrorCode`. Web belum mengonsumsi bentuk error di PRD ini | Perlu dipindah ke `@oddo/shared` di PRD-001 saat frontend mulai menangani error |
| D-6 | `version` bernilai `unknown` kalau database tidak bisa dibaca | PRD tidak menentukan nilainya saat database `down` (contoh 503 di §9 memakai database yang masih `up`) | Ditutup test; mudah diubah kalau Mentor mau nilai lain |
| D-7 | Baris seed `app.version` yang hilang dihitung sebagai `database: down` | Pemeriksaan ini ada untuk membuktikan rantai migrasi → seed → Prisma hidup; kalau seed belum jalan, rantai itu putus. Sejalan dengan edge case §11 no. 3 | Ditutup test "reports the database as down when the seed row is missing" |

**Tidak ada TODO, mock, atau stub yang tersisa.** `prisma/seed/demo.ts` memang kosong —
itu diminta eksplisit oleh §13 langkah 9 ("kosong, hanya kerangka").

**Dependency yang ditambahkan** (tidak disebut per-nama di PRD/ADR, jadi dilaporkan di sini):
`nestjs-pino` + `pino-http` + `pino-pretty` (jalur baku memasang pino di NestJS),
`ioredis` (klien Redis), `uuid` (UUID v7, ADR-0001 B3), `dotenv` dan `dotenv-cli` (satu `.env`
di root dibaca oleh api, web, dan Prisma CLI), `npm-run-all2` (`run-s`/`run-p`, diminta
§2.3 sebagai pengganti `&&` di script npm), `class-validator` dan `class-transformer`
(ADR-0001 B6), serta `tailwindcss-animate`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `@radix-ui/react-slot` (prasyarat komponen shadcn/ui).

---

**Hal yang perlu diputuskan Mentor untuk PRD berikutnya:**

1. **`ApiErrorResponse` pindah ke `@oddo/shared`?** (lihat D-5). Begitu layar login PRD-001
   harus membaca `code` dari response error, tipe itu jadi kontrak dua sisi.
2. **Access log untuk path di luar `/api`.** NestJS menempelkan global prefix ke path
   middleware, sehingga middleware logger meng-cover `/api/**` — seluruh permukaan aplikasi —
   tapi request ke `/` atau `/favicon.ico` tidak menghasilkan baris log. Perlu diputuskan
   apakah itu diterima, atau logger harus dipasang manual di luar prefix.
3. **`LOG_LEVEL` di `.env.test`.** PRD menetapkan `debug`, jadi keluaran `pnpm test` penuh JSON
   log mentah. Kalau Mentor setuju, `warn` akan membuat kegagalan test jauh lebih mudah dibaca.
4. **Prisma 7 menghapus `package.json#prisma`.** Sekarang muncul warning deprecation di setiap
   perintah Prisma; suatu saat perlu pindah ke `prisma.config.ts`. Bukan urgensi PRD ini.
5. **Zona `import/no-restricted-paths` antar modul.** §13 langkah 2 hanya meminta zona
   `packages/**` dilarang mengimpor `apps/**`, dan itu yang dipasang. Aturan modul ADR-0002 §1
   (`core` tidak boleh ke `inventory`/`sales`, `inventory` tidak boleh ke `sales`) belum bisa
   dipasang karena foldernya belum ada — layak dimasukkan ke PRD-002.
6. **Plugin ESLint React/Next belum dipasang** (`react-hooks`, `@next/eslint-plugin-next`).
   Di luar cakupan PRD ini; jadi relevan begitu jumlah halaman bertambah.
7. **E2E Playwright** sudah dijadwalkan PRD-001 dan memang belum ada di sini. Konsekuensinya:
   bukti AC-000-11 di level browser bersandar pada test komponen, bukan browser sungguhan.

---

**Perbaikan setelah verifikasi ulang (fresh clone):**

Verifikasi §13 langkah 16 diulang dari `node_modules` yang benar-benar dihapus, dan baru di
situ ketahuan satu lubang: `pnpm install` saja tidak meng-generate Prisma client, sehingga
`pnpm typecheck` gagal dengan `Module "@prisma/client" has no exported member
'PrismaClient'` sebelum developer sempat menyentuh Docker. Verifikasi sebelumnya luput karena
client-nya sudah ter-generate sejak awal sesi.

Perbaikannya satu baris: `apps/api` mendapat script `postinstall: prisma generate`.
`prisma generate` hanya membaca `schema.prisma` dan tidak menyentuh database, jadi aman
dijalankan sebelum Docker menyala. Langkah di README tidak berubah.

Dibuktikan ulang: `node_modules` dihapus total, `pnpm install --frozen-lockfile` menjalankan
`prisma generate` otomatis, lalu `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`
keempatnya exit 0 (30 test api + 6 test web).

---

**Cara menjalankan & menguji:**

```bash
# sekali saja
corepack enable                 # Windows EPERM? lihat README bagian 1
pnpm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env

# menyalakan
pnpm docker:up                  # menunggu healthcheck Postgres & Redis hijau
pnpm db:migrate
pnpm db:seed
pnpm dev                        # api :3001, web :3000
```

Buka http://localhost:3000 — Database dan Redis dua-duanya harus **up**.

```bash
# gerbang kualitas (keempatnya harus exit 0)
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# pemeriksaan manual
curl http://localhost:3001/api/health            # 200, status ok
curl http://localhost:3001/api/tidak-ada         # 404 bentuk standar
docker compose stop redis
curl http://localhost:3001/api/health            # 503 degraded
docker compose start redis                       # pulih sendiri

# environment tidak valid
# hapus baris DATABASE_URL dari .env, lalu:
pnpm --filter @oddo/api dev                      # exit 1 dalam ~2 detik
```
