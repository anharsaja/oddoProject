---
id: PRD-001a
title: Auth — company minimal, user, argon2id, session Redis, dan halaman login
status: review
priority: P0
modules: [core]
depends_on: [PRD-000]
blocks: [PRD-001b, PRD-002]
estimasi: ~7 jam / 1 sesi coder — checkpoint wajib setelah langkah 9
created: 2026-09-16
updated: 2026-09-16
---

# PRD-001a — Auth: Bisa Login

> Pembaca dokumen ini adalah engineer yang **belum pernah ikut diskusi apa pun**
> tentang project ini. Semua yang dia butuhkan harus ada di sini.
>
> **Wajib dibaca sebelum mulai:** `docs/adr/ADR-0001-tech-stack.md` (B2, B3, B6, B8),
> `docs/adr/ADR-0002-arsitektur-inti.md` (§1, §2, §4), `docs/adr/ADR-0004-composition-root-aplikasi.md`,
> dan `docs/adr/ADR-0005-konfigurasi-environment-dan-lingkungan-test.md`.

---

## 1. Ringkasan

Membuat orang bisa **login sungguhan**: tabel `company` minimal dan tabel `user`,
password di-hash argon2id, session disimpan di Redis dengan sliding expiration yang
dibatasi umur absolut, tiga endpoint (`login`, `logout`, `me`), dan satu halaman
`/login` di web yang benar-benar bisa dipakai.

PRD ini **tidak** menutup aplikasi. Endpoint lain masih terbuka dan halaman web lain
masih bisa dibuka tanpa login — itu pekerjaan PRD-001b, yang menaikkan `AuthGuard`
jadi guard global dan memproteksi route di web. Pemisahan ini disengaja: PRD-001a
mengantarkan "bisa login", PRD-001b mengantarkan "tidak bisa dilewati". Dua-duanya
adalah irisan vertikal yang menghasilkan sesuatu yang bisa dicoba manusia, sesuai
`ADR-0002` §6.

**Masalah yang diselesaikan:** hari ini tidak ada konsep identitas sama sekali. Tanpa
`user` dan `company`, PRD-002 (RBAC, record rule, audit log) tidak punya apa pun untuk
dipasangi hak akses — `created_by` tidak punya target FK, dan `company_id` tidak punya
tabel tujuan. Semua tabel bisnis berikutnya bergantung pada dua tabel ini.

---

## 2. Scope

### 2.1 Termasuk (In Scope)

- [ ] Tabel `company` **minimal** (id, name, active + base fields) dan seed satu baris
      `Default Company`
- [ ] Tabel `user` dengan `company_id NOT NULL` + FK sejak migrasi pertama
- [ ] Seed sistem `admin` dari env var, bersifat **create-only** (lihat BR-AUTH-005)
- [ ] Hash password argon2id dengan parameter yang ditetapkan di §2.4
- [ ] `SessionService` di Redis: sliding TTL + batas absolut + index `user:<id>:sessions`
- [ ] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [ ] `AuthGuard` **dibuat** dan dipasang **lokal** di `/auth/me` (global-nya PRD-001b)
- [ ] `RequestContext` diperluas: `userId` dan `companyId`
- [ ] Halaman `/login` di `apps/web` + `apiFetch()` yang mengirim cookie
- [ ] Empat env var baru, masuk ke **tiga** file sesuai `ADR-0005`
- [ ] Utang PRD-000 butir 1–4 (`PRODUCT-SCOPE` §4.1): `ApiErrorResponse` pindah ke
      `@oddo/shared`, `LOG_LEVEL=warn` di `.env.test`, `@default(now())` pada
      `updatedAt` `system_setting`, konstanta `app.version` disatukan
- [ ] `ErrorCode.UNAUTHORIZED` ditambahkan dan 401 dipetakan ke sana

### 2.2 Tidak Termasuk (Out of Scope)

| Yang tidak dibuat | Ditunda ke |
|---|---|
| `AuthGuard` sebagai `APP_GUARD` global + penegakan `@Public()` di semua endpoint | PRD-001b |
| Proteksi route di `apps/web` (redirect ke `/login` kalau belum login) | PRD-001b |
| Pemindahan halaman health dari `/` ke `/health`, layout shell, tombol logout di UI | PRD-001b |
| Playwright / E2E | PRD-001b |
| Role, Permission, `@RequirePermission`, `PermissionGuard`, audit log | PRD-002 |
| Layar CRUD user & company, company switcher | PRD-002 |
| Reset password, lupa password, ganti password sendiri | PRD-002 |
| Rate limiting & lockout percobaan login | V1 — butuh keputusan kebijakan tersendiri |
| Revoke-all session saat user dinonaktifkan | PRD-002 — **strukturnya** (index set) dibuat di sini |
| SSO / OIDC / "remember me" | Future |

### 2.3 Asumsi

- PRD-000 sudah `done`: Docker, Prisma, Redis, `configureApp`, filter error, dan
  pagar kualitas sudah berjalan.
- Satu instance = satu company aktif untuk sekarang (D-03: multi-company ready, UI single).
  Karena itu halaman login **tidak** punya pilihan company.
- Email adalah identitas login. Tidak ada username.
- Redis yang dipakai adalah `redis:7-alpine` dari `docker-compose.yml` PRD-000.

### 2.4 Konvensi tetap — nilai konkret, bukan saran

Nilai di bawah ini **ditetapkan di sini** dan dipakai PRD berikutnya. Jangan diganti
tanpa ADR baru.

**Kebijakan session** (`ADR-0001` B2 mewajibkan sliding + batas absolut; D-11 mewajibkan
pencabutan akses seketika):

| Aspek | Nilai | Kenapa |
|---|---|---|
| Idle TTL | **120 menit**, diperpanjang tiap request yang lolos `AuthGuard` | User yang sedang bekerja tidak boleh ditendang di tengah shift |
| Batas absolut | **8 jam** sejak `createdAt`, tidak bisa diperpanjang apa pun | Sliding tanpa batas = session abadi |
| Session id | 32 byte dari `crypto.randomBytes`, di-encode `base64url` (43 karakter) | `ADR-0001` B2: 256 bit dari CSPRNG |
| Key session | `session:<sid>` → JSON string `{ userId, companyId, createdAt }` | String, bukan hash — supaya `GET`/`EXPIRE` sederhana |
| Index per user | `user:<userId>:sessions` → SET berisi `sid` | Prasyarat D-11 dan "daftar sesi aktif" di `ADR-0001` B2 |
| TTL index | sama dengan batas absolut, di-`EXPIRE` ulang tiap login | Set tidak boleh hidup lebih lama dari session terpanjangnya |
| Cookie | nama `oddo_session`, `httpOnly`, `SameSite=Lax`, `Secure` saat `NODE_ENV=production`, `path=/`, `maxAge` = batas absolut | `ADR-0001` B2 |

**Parameter argon2id** (OWASP, profil memory-hard rendah yang masih aman):

| Parameter | Nilai |
|---|---|
| Algoritma | `argon2id` |
| `memoryCost` | `19456` (19 MiB) |
| `timeCost` | `2` |
| `parallelism` | `1` |
| Library | `@node-rs/argon2` — prebuilt binary, tidak butuh toolchain C di Windows |

**Environment variable baru** (masuk `envSchema`, `.env.example`, **dan** `.env.test`
dalam satu perubahan yang sama — `ADR-0005` aturan wajib no. 1):

| Variable | Tipe & batas | `.env.example` | `.env.test` |
|---|---|---|---|
| `SESSION_IDLE_TTL_MINUTES` | integer, 5–1440 | `120` | `120` |
| `SESSION_ABSOLUTE_TTL_HOURS` | integer, 1–168 | `8` | `8` |
| `ADMIN_EMAIL` | email, huruf kecil | `admin@oddo.local` | `admin@oddo.local` |
| `ADMIN_PASSWORD` | string, minimal 12 karakter | `ChangeMe!2026` | `ChangeMe!2026` |

Validasi silang yang wajib ada: **batas absolut harus lebih besar dari idle TTL**.
Konfigurasi `idle 120 menit / absolute 1 jam` adalah salah konfigurasi, bukan pilihan.

**Identitas `Default Company`:** id-nya adalah konstanta literal
`01920000-0000-7000-8000-000000000001` (UUID v7 yang sengaja dibuat sekali dan dicatat,
bukan dibangkitkan tiap seed). Dengan begitu seed bisa `upsert` berdasarkan `id` dan
hasilnya sama di lingkungan mana pun.

---

## 3. Dependency

| Arah | Item | Keterangan |
|---|---|---|
| Butuh | PRD-000 | Prisma, Redis, `configureApp`, filter error, pagar kualitas |
| Memblokir | PRD-001b | Guard global butuh `AuthGuard` dan `SessionService` yang sudah ada |
| Memblokir | PRD-002 | `user` dan `company` adalah target FK untuk `created_by`, `role`, `audit_log` |

**ADR yang mengikat PRD ini:**

| ADR | Aturan spesifik yang wajib dipatuhi di sini |
|---|---|
| `ADR-0001` B2 | argon2id · session id 256 bit CSPRNG · cookie `httpOnly`+`SameSite=Lax`+`Secure` di production · **sliding expiration dengan batas absolut** · logout menghapus session di Redis |
| `ADR-0001` B3 | UUID v7 dibangkitkan di application layer |
| `ADR-0001` B5 | Semua kolom waktu `TIMESTAMPTZ`, disimpan UTC |
| `ADR-0001` B6 | `ValidationPipe` global sudah aktif; DTO login memakai `class-validator` |
| `ADR-0001` B8 + amandemen | Bentuk error dirakit **hanya** oleh `AllExceptionsFilter`. Tipenya pindah ke `@oddo/shared` di PRD ini |
| `ADR-0001` B9 | Log terstruktur membawa `requestId`. **Dilarang** masuk log: password, session id, isi cookie |
| `ADR-0001` B10 | Migrasi di-commit; seed `system` vs `demo` dipisah |
| `ADR-0002` §2 | `company_id NOT NULL` di tabel bisnis — `user` mematuhinya sejak migrasi pertama |
| `ADR-0002` §4 + amandemen | Base fields; `created_at` **dan** `updated_at` punya `@default(now())` |
| `ADR-0004` | `cookie-parser` masuk lewat Kanal 1 (`configureApp`). `AuthGuard` butuh DI → Kanal 2, tapi di PRD ini dipasang **lokal**, belum `APP_GUARD` |
| `ADR-0005` | Env var baru wajib masuk tiga file. Test memakai `oddo_test` + Redis index `/1` |

**Keputusan owner yang mengikat:** D-03 (multi-company ready, UI single), D-11 (session
Redis + httpOnly cookie, argon2id, pencabutan akses berlaku seketika).

---

## 4. User Story

```text
US-001a-01

Title:   Login ke aplikasi
As a:    karyawan yang punya akun
I want:  memasukkan email dan password lalu masuk ke aplikasi
So that: saya bisa memakai sistem sebagai diri saya sendiri, bukan sebagai anonim
Priority: MVP
```

```text
US-001a-02

Title:   Tetap login selama saya bekerja
As a:    karyawan yang memakai aplikasi sepanjang shift
I want:  tidak ter-logout selama saya masih aktif memakainya
So that: saya tidak kehilangan pekerjaan di tengah jalan karena timer
Priority: MVP
```

```text
US-001a-03

Title:   Keluar dan benar-benar keluar
As a:    karyawan yang memakai komputer bersama
I want:  menekan logout dan yakin session saya mati di server, bukan hanya di browser
So that: orang berikutnya di komputer itu tidak melanjutkan session saya
Priority: MVP
```

```text
US-001a-04

Title:   Instance baru punya satu admin
As a:    orang yang memasang aplikasi ini pertama kali
I want:  ada satu akun admin yang terbentuk dari konfigurasi, bukan dari layar
So that: saya bisa login pertama kali tanpa menyentuh database
Priority: MVP
```

---

## 5. Business Workflow & State Machine

**Tidak berlaku sebagai state machine dokumen** — PRD ini tidak membuat dokumen bisnis.
Yang ada adalah siklus hidup session, dan itu bukan kolom `state` di database melainkan
konsekuensi dari TTL di Redis:

```text
                    login
                      │
                      ▼
              ┌───────────────┐   request lolos AuthGuard
              │    aktif      │◄──── idle TTL di-reset ke
              │ (di Redis)    │      min(idle, sisa absolut)
              └───────┬───────┘
                      │
   ┌──────────────────┼──────────────────┐
   │                  │                  │
 logout        idle > 120 menit    umur > 8 jam
   │                  │                  │
   ▼                  ▼                  ▼
DEL + SREM      key kedaluwarsa    ditolak & dihapus
                 sendiri di Redis   saat request berikutnya
```

Perhatikan kolom paling kanan: batas absolut **tidak** dijaga oleh TTL Redis, karena TTL
selalu ditimpa oleh perpanjangan idle. Batas absolut dijaga oleh perbandingan terhadap
`createdAt` di dalam payload, dan itulah sebabnya `createdAt` wajib disimpan di payload.

---

## 6. Business Rules

```text
BR-AUTH-001

Login berhasil hanya kalau email terdaftar, user-nya aktif, dan password cocok
dengan hash argon2id yang tersimpan.

Berlaku saat  : POST /api/auth/login
Jika dilanggar: 401 UNAUTHORIZED dengan message "Email atau password salah"
```

```text
BR-AUTH-002

Tiga kegagalan login — email tidak terdaftar, password salah, dan user nonaktif —
menghasilkan respons yang PERSIS SAMA: status, code, dan message.

Berlaku saat  : POST /api/auth/login
Jika dilanggar: penyerang bisa memakai halaman login untuk memetakan email mana
                yang terdaftar di sistem ini
```

```text
BR-AUTH-003

Session diperpanjang setiap request yang lolos AuthGuard, tapi TTL yang dipasang
tidak pernah melewati batas absolut: ttl = min(idle TTL, createdAt + batas absolut - sekarang).

Berlaku saat  : setiap request yang membawa cookie session valid
Jika dilanggar: session yang dipakai terus-menerus tidak akan pernah kedaluwarsa
```

```text
BR-AUTH-004

Session yang umurnya sudah melewati batas absolut ditolak DAN dihapus dari Redis
beserta keanggotaannya di index user, bukan sekadar ditolak.

Berlaku saat  : setiap request yang membawa cookie session
Jika dilanggar: key mati menumpuk di Redis dan index user berisi sampah
```

```text
BR-AUTH-005

Seed admin bersifat create-only: kalau user dengan ADMIN_EMAIL sudah ada, seed
TIDAK menyentuh baris itu sama sekali — termasuk tidak menulis ulang password_hash.

Berlaku saat  : setiap `pnpm db:seed`
Jika dilanggar: setiap seed mengembalikan password admin ke nilai env var,
                membatalkan penggantian password yang sengaja dilakukan orang
```

```text
BR-AUTH-006

Setiap session yang dibuat wajib terdaftar di index `user:<userId>:sessions`,
dan setiap session yang dihapus wajib dicabut dari index itu.

Berlaku saat  : login, logout, dan penolakan karena batas absolut
Jika dilanggar: D-11 "pencabutan akses berlaku seketika" mustahil dikerjakan
                PRD-002 tanpa memindai seluruh keyspace Redis
```

```text
BR-AUTH-007

Email disimpan dalam huruf kecil dan unik di seluruh instance, bukan unik per company.

Berlaku saat  : pembuatan user (seed di PRD ini, layar user di PRD-002)
Jika dilanggar: form login tidak punya pilihan company, jadi satu email yang muncul
                di dua company membuat "user mana yang login" jadi ambigu
```

---

## 7. Data Model

### 7.1 Entity & relationship

```text
Company
 └── 1:N ── User          (user.company_id → company.id, NOT NULL)

User
 ├── N:1 ── Company
 ├── N:1 ── User (created_by, nullable — self reference)
 └── N:1 ── User (updated_by, nullable — self reference)
```

Session **tidak** punya tabel. Session hidup di Redis (`ADR-0001` B2); Postgres tidak
menyimpan daftar session.

### 7.2 Definisi field

**Tabel: `company`**

| Field | Tipe | Null? | Default | Unique | Keterangan |
|---|---|---|---|---|---|
| `id` | `UUID` | no | — | yes (PK) | UUID v7 dari application layer |
| `name` | `VARCHAR(200)` | no | — | no | mis. `Default Company` |
| `active` | `BOOLEAN` | no | `true` | no | archive, bukan delete |
| `created_at` | `TIMESTAMPTZ(6)` | no | `now()` | no | |
| `created_by` | `UUID` | **yes** | `NULL` | no | FK `user.id`. `NULL` berarti dibuat proses sistem (seed) |
| `updated_at` | `TIMESTAMPTZ(6)` | no | `now()` | no | `@default(now()) @updatedAt` — **keduanya**, lihat `ADR-0002` §4 amandemen |
| `updated_by` | `UUID` | yes | `NULL` | no | FK `user.id` |

`company` tidak punya `company_id` — ia *adalah* company.

**Tabel: `user`**

| Field | Tipe | Null? | Default | Unique | Keterangan |
|---|---|---|---|---|---|
| `id` | `UUID` | no | — | yes (PK) | UUID v7 dari application layer |
| `company_id` | `UUID` | no | — | no | FK `company.id`, dasar record rule PRD-002 |
| `email` | `VARCHAR(255)` | no | — | **yes** | selalu huruf kecil (BR-AUTH-007) |
| `password_hash` | `TEXT` | no | — | no | string encoded argon2id lengkap dengan salt & parameter |
| `name` | `VARCHAR(200)` | no | — | no | nama tampilan |
| `is_superadmin` | `BOOLEAN` | no | `false` | no | melewati lapis 1 permission (`ADR-0002` §3), tetap tunduk record rule |
| `active` | `BOOLEAN` | no | `true` | no | user nonaktif tidak bisa login |
| `last_login_at` | `TIMESTAMPTZ(6)` | yes | `NULL` | no | diperbarui saat login berhasil |
| `created_at` | `TIMESTAMPTZ(6)` | no | `now()` | no | |
| `created_by` | `UUID` | **yes** | `NULL` | no | FK `user.id` (self). `NULL` = dibuat seed sistem |
| `updated_at` | `TIMESTAMPTZ(6)` | no | `now()` | no | `@default(now()) @updatedAt` |
| `updated_by` | `UUID` | yes | `NULL` | no | FK `user.id` (self) |

**Kenapa `created_by` nullable padahal `ADR-0002` §4 menulisnya wajib** — ini disengaja
dan hanya berlaku untuk baris yang dibuat proses sistem. Admin pertama dan
`Default Company` tidak dibuat oleh user mana pun; memaksakan `NOT NULL` berarti
mengarang pembuat. `NULL` di kolom ini punya arti tunggal dan tertulis: **dibuat oleh
seed sistem**. Baris yang dibuat lewat layar (PRD-002) wajib mengisinya.

**Index:**

| Index | Alasan |
|---|---|
| `user.email` unique | identitas login, dan penegakan BR-AUTH-007 |
| `user.company_id` | FK lookup + dasar record rule PRD-002 |

**Constraint:**

| Constraint | Isi |
|---|---|
| `user_email_lowercase` | `CHECK (email = lower(email))` |
| `user_name_not_empty` | `CHECK (length(btrim(name)) > 0)` |
| `company_name_not_empty` | `CHECK (length(btrim(name)) > 0)` |
| FK `user.company_id` | `ON DELETE RESTRICT` |
| FK `user.created_by`, `user.updated_by`, `company.created_by`, `company.updated_by` | `ON DELETE RESTRICT` |

`RESTRICT` di mana-mana karena aturan keras no. 4 di `CLAUDE.md`: tidak ada `DELETE`
fisik. Baris dinonaktifkan lewat `active = false`.

CHECK constraint ditulis tangan di file migrasi — `schema.prisma` tidak bisa
mengekspresikannya (preseden: migrasi kedua PRD-000).

**Migrasi data / seed sistem** (`seed/system`, wajib ada di lingkungan mana pun):

| Urutan | Yang dibuat | Cara |
|---|---|---|
| 1 | `company` `Default Company` | `upsert` by `id` = konstanta §2.4, `update: {}` |
| 2 | `user` admin | `upsert` by `email` = `ADMIN_EMAIL`, **`update: {}`** (BR-AUTH-005) |

Admin dibuat dengan `is_superadmin = true`, `active = true`, `company_id` =
`Default Company`, `name` = `Administrator`, `created_by = NULL`.

Urutannya tidak boleh dibalik: `user.company_id` NOT NULL, jadi company harus ada lebih
dulu. Keduanya dijalankan dalam **satu transaksi** — instance dengan company tapi tanpa
admin adalah keadaan yang tidak bisa dipakai siapa pun.

---

## 8. Permission

**Belum berlaku** — sistem permission (`role`, `permission`, `@RequirePermission`,
`PermissionGuard`) dibangun di PRD-002.

Yang berlaku di PRD ini:

| Endpoint | Perlindungan |
|---|---|
| `POST /api/auth/login` | `@Public()` |
| `POST /api/auth/logout` | `@Public()` — lihat §9, logout wajib idempotent |
| `GET /api/auth/me` | `@UseGuards(AuthGuard)` — dipasang lokal di controller |
| `GET /api/health` | `@Public()` (sudah ada dari PRD-000) |

`AuthGuard` **tidak** dipasang global di PRD ini. Alasannya bukan kemalasan: menaikkannya
jadi `APP_GUARD` mengubah perilaku setiap endpoint sekaligus dan menuntut pengujian
menyeluruh terhadap `@Public()` — itu isi PRD-001b, dan nilainya ("aplikasi benar-benar
tertutup") layak diuji sebagai satu kesatuan.

`is_superadmin` sudah ada di tabel `user` supaya PRD-002 tidak perlu migrasi tambahan,
tapi **belum dipakai memutuskan apa pun** di PRD ini.

---

## 9. API Contract

Semua endpoint di bawah prefix `/api` (`ADR-0005` §5 / `configureApp`).

### `POST /api/auth/login`

- **Purpose:** menukar email + password dengan session
- **Authorization:** `@Public()`
- **Request body:**

```json
{ "email": "admin@oddo.local", "password": "ChangeMe!2026" }
```

- **Response 200:**

```json
{
  "user": {
    "id": "01920000-0000-7000-8000-00000000000a",
    "email": "admin@oddo.local",
    "name": "Administrator",
    "companyId": "01920000-0000-7000-8000-000000000001",
    "isSuperadmin": true
  },
  "session": {
    "idleExpiresAt": "2026-09-16T10:12:33.120Z",
    "absoluteExpiresAt": "2026-09-16T16:12:33.120Z"
  }
}
```

  Disertai header:
  `Set-Cookie: oddo_session=<sid>; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
  (ditambah `Secure` saat `NODE_ENV=production`).

- **Validation:** `email` wajib, format email, dinormalisasi jadi huruf kecil sebelum
  dicari. `password` wajib, string, panjang 1–200. Field lain ditolak
  (`forbidNonWhitelisted` sudah aktif dari PRD-000).
- **Errors:**

  | HTTP | Code | Kapan terjadi |
  |---|---|---|
  | 400 | `VALIDATION_ERROR` | body tidak sesuai DTO |
  | 401 | `UNAUTHORIZED` | email tidak terdaftar **atau** password salah **atau** user nonaktif — respons identik (BR-AUTH-002) |
  | 500 | `INTERNAL_ERROR` | Redis atau Postgres tidak bisa dihubungi. **Bukan** 401 — kegagalan infrastruktur tidak boleh menyamar jadi kredensial salah |

- **Side effects:** membuat key `session:<sid>`, `SADD` ke `user:<id>:sessions`,
  `EXPIRE` index sebesar batas absolut, dan mengisi `user.last_login_at`.
- **Idempotency:** tidak. Dua kali login = dua session aktif (multi-device diizinkan).

### `POST /api/auth/logout`

- **Purpose:** mematikan session yang sedang dipakai, di server
- **Authorization:** `@Public()` — supaya cookie basi atau tidak ada tetap menghasilkan
  204, bukan 401. Tombol logout tidak boleh gagal.
- **Request:** tanpa body. Session diambil dari cookie.
- **Response 204:** tanpa body, disertai penghapusan cookie
  (`Set-Cookie: oddo_session=; Max-Age=0` dengan atribut yang sama seperti saat dipasang).
- **Errors:** tidak ada jalur 4xx. Cookie tidak ada, cookie tidak dikenal, dan session
  sudah kedaluwarsa — ketiganya 204.
- **Side effects:** `DEL session:<sid>` + `SREM user:<userId>:sessions <sid>`.
- **Idempotency:** ya. Logout dua kali tetap 204.

### `GET /api/auth/me`

- **Purpose:** menjawab "saya login sebagai siapa", dan sekaligus memperpanjang session
- **Authorization:** `@UseGuards(AuthGuard)`
- **Request:** tanpa body. Cookie `oddo_session` wajib.
- **Response 200:**

```json
{
  "id": "01920000-0000-7000-8000-00000000000a",
  "email": "admin@oddo.local",
  "name": "Administrator",
  "companyId": "01920000-0000-7000-8000-000000000001",
  "isSuperadmin": true,
  "session": {
    "idleExpiresAt": "2026-09-16T10:42:10.004Z",
    "absoluteExpiresAt": "2026-09-16T16:12:33.120Z"
  }
}
```

- **Errors:**

  | HTTP | Code | Kapan terjadi |
  |---|---|---|
  | 401 | `UNAUTHORIZED` | cookie tidak ada, session tidak ditemukan, atau umur session melewati batas absolut |
  | 404 | `NOT_FOUND` | session valid tapi user-nya sudah tidak ada — seharusnya mustahil karena user tidak pernah dihapus; tetap ditangani, jangan sampai 500 |

- **Side effects:** memperpanjang TTL session (BR-AUTH-003).

### Kenapa `AuthGuard` tidak menyentuh Postgres

`AuthGuard` hanya membaca Redis. Ia **tidak** memeriksa `user.active` ke database di
setiap request — itu berarti satu query Postgres per request untuk seluruh aplikasi,
selamanya.

Penonaktifan user tetap berlaku seketika (D-11), tapi mekanismenya berbeda: PRD-002
menghapus seluruh session milik user itu lewat index `user:<id>:sessions` pada saat
user dinonaktifkan. Pencabutan dikerjakan sekali saat kejadian, bukan diperiksa
jutaan kali untuk berjaga-jaga. **Inilah alasan index itu wajib ada sejak PRD ini,
meskipun pemakainya baru lahir di PRD-002.**

`GET /api/auth/me` memang membaca Postgres, karena `name` dan `email` harus segar —
tapi itu satu endpoint, bukan setiap request.

---

## 10. UI/UX Requirements

Satu halaman baru: `/login` di `apps/web`.

| Aspek | Ketentuan |
|---|---|
| Lokasi di navigasi | Belum ada navigasi. Halaman berdiri sendiri, diakses langsung |
| Isi | Judul `Oddo ERP`, subjudul `Masuk ke akun Anda`, field Email, field Password, tombol `Masuk` |
| Field | `email` (`type="email"`, autofocus, `autocomplete="username"`), `password` (`type="password"`, `autocomplete="current-password"`). Keduanya wajib |
| Loading state | Tombol disabled + teksnya jadi `Memproses…` selama request berjalan. Field ikut disabled |
| Error state | Pesan dari field `message` pada body error API, ditampilkan di atas tombol dengan warna destructive. **Jangan** menampilkan `code`, `requestId`, atau stack trace |
| Error jaringan | Kalau `fetch` gagal total: `Tidak dapat menghubungi server di <API_URL>` — memakai nilai `API_URL` apa adanya, pola yang sama dengan halaman health PRD-000 |
| Sukses | Redirect ke `/` |
| Empty state | Tidak berlaku |
| Permission denied | Tidak berlaku — belum ada permission |
| Konfirmasi | Tidak berlaku |
| Responsif | Terbaca di lebar 400px. Kartu login `max-w-sm`, terpusat |
| Aksesibilitas | Setiap input punya `<label>` yang terhubung lewat `htmlFor`. Pesan error memakai `role="alert"` |

Komponen shadcn/ui yang perlu ditambah: **`input` dan `label`**. Hanya itu — `card`,
`button`, `badge`, `skeleton` sudah ada dari PRD-000. Jangan memasang katalognya.

Halaman `/` **tetap** halaman health PRD-000 di PRD ini. Pemindahannya ke `/health`
beserta proteksi route adalah PRD-001b.

---

## 11. Edge Cases & Error Handling

| # | Skenario | Perilaku yang benar |
|---|---|---|
| 1 | Redis mati saat login | 500 `INTERNAL_ERROR`. Bukan 401 — kegagalan infrastruktur tidak boleh terbaca sebagai kredensial salah |
| 2 | Redis mati saat request ber-cookie | 500 `INTERNAL_ERROR` dari `AuthGuard`. Bukan 401 — kalau tidak, seluruh user terlihat "ter-logout" padahal sessionnya utuh |
| 3 | Cookie berisi sid yang tidak ada di Redis | 401 `UNAUTHORIZED`, cookie dihapus di response |
| 4 | Session melewati batas absolut | 401 `UNAUTHORIZED` + `DEL` + `SREM` (BR-AUTH-004) |
| 5 | User login di dua browser | Dua session aktif berdampingan. Logout di satu browser tidak mematikan yang lain |
| 6 | `ADMIN_PASSWORD` diganti di `.env` lalu seed dijalankan lagi | Password admin **tidak** berubah (BR-AUTH-005). Satu-satunya cara mengganti password di PRD ini adalah lewat database |
| 7 | `ADMIN_EMAIL` diganti lalu seed dijalankan | Terbentuk admin **kedua**. Yang lama tidak dihapus dan tidak dinonaktifkan — konsekuensi yang diterima, bukan bug |
| 8 | `SESSION_ABSOLUTE_TTL_HOURS` ≤ `SESSION_IDLE_TTL_MINUTES` | Boot gagal dengan pesan validasi env yang menyebut kedua variable |
| 9 | Email dikirim dengan huruf besar (`Admin@Oddo.Local`) | Login tetap berhasil — email dinormalisasi jadi huruf kecil sebelum pencarian |
| 10 | Body login membawa field tak dikenal | 400 `VALIDATION_ERROR` (perilaku bawaan dari PRD-000) |
| 11 | Password kosong `""` | 400 `VALIDATION_ERROR`, bukan 401. Ini kesalahan bentuk request, bukan kredensial salah |
| 12 | Index `user:<id>:sessions` memuat sid yang key session-nya sudah kedaluwarsa | Dibersihkan malas saat index dibaca: sid yang key-nya hilang di-`SREM`. Redis tidak membuang member SET saat key yang dirujuknya expire — ini harus diurus sendiri |

---

## 12. Audit Trail & Non-Functional

### 12.1 Audit

Tabel `audit_log` baru lahir di PRD-002, jadi yang berlaku di sini adalah **logging
terstruktur** (`ADR-0001` B9):

| Kejadian | Level | Yang dicatat | Yang DILARANG ikut |
|---|---|---|---|
| Login berhasil | `info` | `event: auth.login.success`, `userId`, `companyId`, `requestId` | password, session id, isi cookie |
| Login gagal | `warn` | `event: auth.login.failed`, `email` yang dicoba, `requestId` | password, alasan spesifik (email tak ada vs password salah) tidak boleh bocor ke **response**, boleh di log |
| Logout | `info` | `event: auth.logout`, `userId`, `requestId` | session id |
| Session ditolak karena batas absolut | `info` | `event: auth.session.expired_absolute`, `userId` | session id |

Session id diperlakukan seperti password: tidak pernah masuk log, tidak pernah masuk
response body. Satu-satunya tempatnya adalah cookie `httpOnly`.

`user.last_login_at` diperbarui saat login berhasil — ini bukan audit log, tapi
informasi yang akan ditampilkan layar user PRD-002.

### 12.2 Non-functional

| Aspek | Target |
|---|---|
| Latency `POST /api/auth/login` | p95 < 400 ms. Argon2id memang lambat **dengan sengaja**; 19 MiB / timeCost 2 berada di kisaran 50–150 ms per verifikasi |
| Latency `GET /api/auth/me` | p95 < 100 ms |
| Biaya `AuthGuard` per request | 2 perintah Redis (`GET` lalu `EXPIRE`), 0 query Postgres |
| Transaksi DB | Seed company + admin berjalan dalam satu transaksi. Login hanya menulis `last_login_at` |
| Concurrency | Login bersamaan dari dua perangkat menghasilkan dua sid berbeda; tidak ada state bersama yang perlu dikunci |
| Waktu `pnpm test` | tetap < 60 detik untuk seluruh workspace |

**Catatan implementasi TTL — jangan dioptimasi lebih dulu.** Perpanjangan memakai `GET`
lalu `EXPIRE`, dua round trip. `GETEX` menggabungkan keduanya dalam satu perintah, tapi
nilai TTL-nya harus dihitung dari `createdAt` yang baru diketahui **setelah** membaca —
jadi `GETEX` hanya benar kalau ditambah `EXPIRE` korektif di dekat batas absolut.
Kerumitan itu tidak sepadan untuk sekarang. Kalau nanti terbukti jadi hambatan, itu
optimasi yang aman dilakukan belakangan karena terkurung di satu method.

---

## 13. Rencana Implementasi

Urutan ini disusun supaya tiap langkah bisa diverifikasi sebelum lanjut.

**Bagian A — membereskan utang PRD-000 (langkah 1–3).** Dikerjakan lebih dulu karena
menyentuh file yang akan dipakai sepanjang PRD ini.

1. Pindahkan `ApiErrorResponse` dan `ApiErrorDetail` dari
   `apps/api/src/common/api-error.ts` ke `packages/shared/src/api-error.ts`, ekspor dari
   `packages/shared/src/index.ts`. `apps/api` mengimpornya dari `@oddo/shared`;
   `errorCodeForStatus()` dan `isErrorCode()` **tetap** di `apps/api` (keduanya logika,
   bukan tipe). Tambahkan `UNAUTHORIZED = 'UNAUTHORIZED'` ke enum `ErrorCode` dan
   petakan `401 → UNAUTHORIZED` di `STATUS_TO_CODE`.
2. Ubah `LOG_LEVEL` di `.env.test` dari `debug` jadi `warn`.
3. Tambahkan `@default(now())` pada `updatedAt` di model `SystemSetting`, buat migrasi
   baru untuk itu (jangan sunting migrasi lama), lalu satukan konstanta `app.version`:
   buat `apps/api/src/common/system-setting.keys.ts`, dan `health.service.ts` serta
   `prisma/seed/system.ts` sama-sama mengimpor dari sana.

   > Verifikasi bagian A: `pnpm lint`, `pnpm typecheck`, `pnpm test` masih exit 0.
   > Ini titik commit yang bersih.

**Bagian B — backend auth (langkah 4–9).**

4. Tambahkan empat env var §2.4 ke `envSchema` (termasuk `.refine()` silang untuk
   edge case no. 8), `.env.example`, dan `.env.test`. Jalankan `pnpm --filter @oddo/api
   run check:env` untuk membuktikan gerbangnya membaca yang baru.
5. Model Prisma `Company` dan `User` sesuai §7.2 + migrasi. CHECK constraint ditulis
   tangan di file migrasi yang sama atau migrasi terpisah — bebas, asal di-commit.
6. `apps/api/src/core/auth/password.service.ts`: `hash()` dan `verify()` memakai
   `@node-rs/argon2` dengan parameter §2.4. Murni, tanpa DB — mudah diuji unit.
7. Seed sistem: company + admin dalam satu transaksi, keduanya `update: {}`
   (BR-AUTH-005). Letakkan di `prisma/seed/system.ts` bersama seed yang sudah ada.
8. `apps/api/src/core/auth/session.service.ts`:
   - `create(userId, companyId)` → sid + `SET` + `SADD` + `EXPIRE` index
   - `read(sid)` → `GET`, cek batas absolut, `EXPIRE` dengan `min(...)`, kembalikan
     payload + dua waktu kedaluwarsa. Kalau lewat batas absolut: `DEL` + `SREM` lalu
     kembalikan `null`
   - `destroy(sid)` → `DEL` + `SREM`
   - `listByUser(userId)` → baca index, buang sid yang key-nya sudah hilang (`SREM`),
     kembalikan sisanya. **Dibuat di PRD ini walau pemakainya PRD-002** — tanpa satu
     pembaca, tidak ada yang membuktikan index-nya benar.
9. `AuthGuard` (Kanal 2 `ADR-0004`, tapi **dipasang lokal**), `@CurrentUser()` decorator,
   perluasan `RequestStore` dengan `userId` dan `companyId`, lalu `AuthController`
   dengan tiga endpoint §9. `cookie-parser` didaftarkan di `configureApp` (Kanal 1).

   > ### CHECKPOINT — berhenti di sini kalau sesi harus dipotong
   > Backend sudah utuh dan bisa di-commit: `curl` login mengembalikan cookie, `me`
   > mengembalikan identitas, `logout` mematikan session. Test backend sudah hijau.
   > Yang tersisa murni UI. Kalau berhenti di sini, set `status: blocked` dengan catatan
   > "checkpoint langkah 9, sisa bagian C".

**Bagian C — web (langkah 10–12).**

10. `apps/web/src/lib/api-client.ts`: `apiFetch<T>(path, init)` yang selalu memakai
    `credentials: 'include'`, mem-parse body error jadi `ApiErrorResponse` dari
    `@oddo/shared`, dan melempar error bertipe yang membawa `message` + `code`.
11. Pasang komponen shadcn `input` dan `label`.
12. Halaman `apps/web/src/app/login/page.tsx` sesuai §10.

**Bagian D — pembuktian (langkah 13–14).**

13. Test sesuai §15.
14. Jalankan `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — keempatnya exit 0.
    Perbarui `docs/prd/README.md` dan isi `## Catatan Coder

> Diisi oleh sesi Coder setelah implementasi selesai.

**Ringkasan yang dikerjakan:**

Seluruh bagian 13 (langkah 1–14) dikerjakan, termasuk utang PRD-000 butir 1–4. Hasilnya:
orang bisa login sungguhan lewat halaman `/login`, session hidup di Redis dengan sliding
TTL yang dibatasi umur absolut, dan tiga endpoint `login` / `logout` / `me` bekerja
sebagaimana §9 menuliskannya.

Empat hal yang perlu diketahui Mentor tentang pendekatannya:

1. **Batas absolut dihitung dari payload, bukan dari TTL Redis.** TTL selalu ditimpa oleh
   perpanjangan idle, jadi ia tidak bisa menjaga apa pun yang berumur panjang. `createdAt`
   disimpan di payload dan dibandingkan di setiap pembacaan — persis seperti yang
   digambarkan diagram §5. Perhitungannya dipisah jadi fungsi murni
   (`session-ttl.ts`) supaya AC-001a-07 tidak bergantung pada jam dinding.
2. **`AuthGuard` hanya menyentuh Redis.** Tidak ada query Postgres per request, sesuai §9.
   `GET /api/auth/me` memang membaca Postgres, tapi itu satu endpoint — bukan setiap request.
3. **Guard berjalan sebelum interceptor di NestJS.** Karena itu `AuthGuard` menaruh identitas
   di objek request, dan `RequestIdInterceptor`-lah yang memasukkannya ke `RequestContext`.
   Urutan sebaliknya mustahil: saat guard berjalan, AsyncLocalStorage belum dibuka.
4. **Kegagalan Redis dibiarkan naik jadi 500.** `SessionService` tidak pernah menerjemahkan
   error infrastruktur jadi "session tidak valid" — kalau itu terjadi, seluruh user yang
   sedang login akan diberi tahu bahwa kredensial mereka salah (§11 no. 1 dan 2).

---

**File yang dibuat/diubah:**

*Utang PRD-000 (bagian A)*

| Path | Perubahan |
|---|---|
| `packages/shared/src/api-error.ts` | **baru** — `ApiErrorResponse` + `ApiErrorDetail` pindah ke sini (butir 1) |
| `packages/shared/src/error-code.ts` | `UNAUTHORIZED` ditambahkan ke enum |
| `packages/shared/src/index.ts` | mengekspor tipe error yang baru pindah |
| `apps/api/src/common/api-error.ts` | tinggal logika pemetaan status → code; `401 → UNAUTHORIZED` ditambahkan |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | tipe diimpor dari `@oddo/shared` |
| `apps/api/src/common/validation/validation-exception.factory.ts` | idem |
| `apps/api/src/common/system-setting.keys.ts` | **baru** — satu-satunya deklarasi key `app.version` dan `app.initialized_at` (butir 4) |
| `apps/api/src/health/health.service.ts` | mengimpor key, tidak lagi mendeklarasikannya |
| `.env.test` | `LOG_LEVEL` `debug` → `warn` (butir 2) |
| `apps/api/prisma/schema.prisma` | `@default(now())` pada `SystemSetting.updatedAt` (butir 3) |
| `prisma/migrations/20260916083255_system_setting_updated_at_default/` | **baru** — migrasi untuk butir 3; migrasi lama tidak disunting |

*Backend auth (bagian B)*

| Path | Peran |
|---|---|
| `apps/api/src/config/env.schema.ts` | Empat env var baru + `integerBetween()` + `.refine()` silang idle/absolut |
| `.env.example`, `.env.test` | Keempat variable, sesuai aturan wajib `ADR-0005` no. 1 |
| `prisma/migrations/20260916083558_company_and_user/` | **baru** — tabel `company` + `user`, FK `RESTRICT`, dan tiga CHECK constraint yang ditulis tangan |
| `apps/api/prisma/schema.prisma` | Model `Company` dan `User` sesuai §7.2 |
| `apps/api/prisma/seed/system.ts` | `seedCompanyAndAdmin()` dalam satu transaksi, keduanya `update: {}` (BR-AUTH-005) |
| `apps/api/src/core/auth/password.service.ts` | argon2id dengan parameter §2.4 |
| `apps/api/src/core/auth/session-ttl.ts` | `resolveSessionTtl()` — fungsi murni, inti BR-AUTH-003 dan BR-AUTH-004 |
| `apps/api/src/core/auth/session.service.ts` | `create` / `read` / `destroy` / `listByUser` + index `user:<id>:sessions` |
| `apps/api/src/core/auth/session.cookie.ts` | Nama, atribut, pemasangan dan penghapusan cookie |
| `apps/api/src/core/auth/auth.guard.ts` | Membaca cookie → Redis; mengisi `request.auth` |
| `apps/api/src/core/auth/auth.service.ts` | Login, logout, dan pembacaan identitas + logging §12.1 |
| `apps/api/src/core/auth/auth.controller.ts` | Tiga endpoint §9 |
| `apps/api/src/core/auth/dto/login.dto.ts` | Validasi body login |
| `apps/api/src/core/auth/auth.module.ts` | Modul; guard sebagai provider biasa (belum `APP_GUARD`) |
| `apps/api/src/common/context/request-context.ts` | `RequestStore` diperluas `userId` + `companyId`; tipe `RequestAuth` |
| `apps/api/src/common/decorators/current-user.decorator.ts` | **baru** — `@CurrentUser()` |
| `apps/api/src/common/interceptors/request-id.interceptor.ts` | Mengangkat identitas dari request ke `RequestContext` |
| `apps/api/src/common/redis/redis.service.ts` | Getter `connection` untuk pemakai yang butuh pipeline |
| `apps/api/src/app.setup.ts` | `cookie-parser` lewat Kanal 1 `ADR-0004` |
| `apps/api/src/app.module.ts` | Mendaftarkan `AuthModule` |

*Web (bagian C)*

| Path | Peran |
|---|---|
| `apps/web/src/lib/api-client.ts` | **baru** — `apiFetch()` dengan `credentials: 'include'`, `ApiError`, `ApiUnreachableError` |
| `apps/web/src/components/ui/input.tsx`, `label.tsx` | **baru** — dua komponen shadcn yang diminta §10 |
| `apps/web/src/app/login/page.tsx` | **baru** — halaman `/login` |

*Test (bagian D)*

| Path | Yang diuji |
|---|---|
| `apps/api/src/core/auth/password.service.spec.ts` | hash/verify, salt acak, hash rusak tidak meledak (5 test) |
| `apps/api/src/core/auth/session-ttl.spec.ts` | `min(idle, sisa absolut)`, kasus kedaluwarsa (5 test) |
| `apps/api/src/config/env.schema.spec.ts` | Empat kasus baru: normalisasi email, password pendek, absolut ≤ idle, konfigurasi sah |
| `apps/api/test/auth-helpers.ts` | **baru** — boot lewat `configureApp`, seed, ekstraksi cookie |
| `apps/api/test/auth-login.spec.ts` | AC-001a-01 … 04 + §11 no. 9, 10, 11 (8 test) |
| `apps/api/test/auth-session.spec.ts` | AC-001a-05 … 09 + §11 no. 3 (9 test) |
| `apps/api/test/auth-session-index.spec.ts` | `listByUser` + penyapuan malas §11 no. 12 (4 test) |
| `apps/api/test/auth-seed.spec.ts` | AC-001a-10 (3 test) |
| `apps/api/test/auth-redis-down.spec.ts` | §11 no. 1 dan 2 — 500, bukan 401 (4 test) |
| `apps/api/test/setup-state.ts` | Dulu `setup-db.ts`; sekarang membersihkan Postgres **dan** key Redis (§15) |
| `apps/web/test/login-page.test.tsx` | AC-001a-12 (7 test) |

---

**Bukti Acceptance Criteria:**

| AC | Terpenuhi? | Bukti |
|---|---|---|
| AC-001a-01 Login berhasil | ya | `auth-login.spec.ts` "accepts the seeded administrator and sets a session cookie": email, `companyId`, `isSuperadmin` dicek; body di-serialisasi lalu dipastikan tidak memuat `passwordHash` maupun sid; header `Set-Cookie` memuat `HttpOnly`, `SameSite=Lax`, `Path=/`. Manual: `curl` memberi `Set-Cookie: oddo_session=…; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax` |
| AC-001a-02 Session ada di Redis | ya | "records the session and its index entry in Redis": `session:<sid>` ada, payload memuat `userId`/`companyId`/`createdAt`, `TTL > 0` dan `<= 7200`, dan `SISMEMBER user:<id>:sessions <sid>` = 1 |
| AC-001a-03 Tiga kegagalan identik | ya | "answers unknown email, wrong password and deactivated user identically": ketiga body diserialisasi lalu **dibandingkan satu sama lain**, bukan dicocokkan ke string harapan — sesuai bunyi AC. Ketiganya juga dipastikan tanpa `Set-Cookie`. User nonaktif dibuat di dalam test dengan password yang benar-benar cocok |
| AC-001a-04 Bentuk error B8 | ya | "keeps the standard error envelope on a failed login": `Object.keys(body).sort()` dicocokkan persis ke enam field, `code = UNAUTHORIZED`, `statusCode = 401` |
| AC-001a-05 `/me` mengenali pemilik cookie | ya | "identifies the owner of the cookie" (email + id cocok, `absoluteExpiresAt` berjarak 8 jam ± 10 detik dari waktu login) dan "refuses a request with no cookie at all" (401 `UNAUTHORIZED`) |
| AC-001a-06 Sliding expiration | ya | "slides the idle window forward on every request": TTL diturunkan manual ke 60 detik, `/me` dipanggil, TTL kembali ke > 7190 dan ≤ 7200 |
| AC-001a-07 Batas absolut | ya | Dua test terpisah. `createdAt` dimundurkan 7 jam 59 menit (`SET … KEEPTTL`) → 200 dan `0 < TTL <= 60`. Dimundurkan 8 jam 1 menit → 401, `EXISTS session:<sid>` = 0, dan `SISMEMBER` = 0 |
| AC-001a-08 Logout | ya | "kills the session on the server when logging out": 204, cookie dihapus dengan `Max-Age=0`, key hilang, `SREM` terjadi, `/me` berikutnya 401, logout kedua tetap 204. Ditambah "answers logout with 204 even with no cookie at all" |
| AC-001a-09 Dua session | ya | "keeps two devices independent": index dibersihkan lebih dulu supaya hitungannya bermakna, dua login → SET berisi 2 sid, logout cookie pertama → SET berisi tepat `[sid kedua]`, `/me` dengan cookie kedua tetap 200 |
| AC-001a-10 Seed create-only | ya | `auth-seed.spec.ts` "never rewrites an existing administrator": `password_hash` diganti jadi penanda, seed dijalankan lagi dengan password berbeda, penanda **masih utuh** dan jumlah baris user tidak berubah |
| AC-001a-11 Konfigurasi TTL ditolak | ya | Manual: `.env` diisi `SESSION_IDLE_TTL_MINUTES=120` + `SESSION_ABSOLUTE_TTL_HOURS=1`, lalu `pnpm --filter @oddo/api run check:env` → **exit 1**, keluarannya `- SESSION_ABSOLUTE_TTL_HOURS: must be longer than SESSION_IDLE_TTL_MINUTES …` (kedua nama muncul). Dikunci juga oleh unit test "rejects an absolute session limit that the idle window can never reach" |
| AC-001a-12 Halaman login | ya | `login-page.test.tsx`, 7 test: label terhubung lewat `htmlFor`, `type`/`autocomplete` benar, tombol jadi `Memproses…` + disabled saat request jalan, pesan error muncul dengan `role="alert"` sementara `code` dan `requestId` **tidak** muncul, `router.push('/')` dipanggil saat sukses, dan pesan `Tidak dapat menghubungi server di <API_URL>` saat fetch gagal. Manual: `GET /login` → HTTP 200, HTML memuat judul, subjudul, `for="email"`, `for="password"`, `autoComplete="username"`, `autoComplete="current-password"`, dan tombol `Masuk` |
| AC-001a-13 Rahasia tidak bocor | ya | Keluaran `pnpm test` ditangkap penuh lalu digrep: nilai `ADMIN_PASSWORD` **0** kemunculan, `oddo_session=` **0**, pola session id **0**, `passwordHash` **0** |
| AC-001a-14 Pagar kualitas | ya | `pnpm lint` (`--max-warnings=0`), `pnpm typecheck`, `pnpm test`, `pnpm build` — keempatnya exit 0. **72 test API** (13 suite) + **13 test web** (2 file). 0 skipped, 0 todo. `eslint-disable` di seluruh repo: **0** |

---

**Deviasi dari PRD + alasannya:**

| # | Deviasi | Alasan | Dampak |
|---|---|---|---|
| D-1 | `ADMIN_EMAIL` di-*lowercase* oleh skema env, bukan ditolak kalau memuat huruf besar | §2.4 menulis tipenya "email, huruf kecil", yang bisa dibaca dua arah. Normalisasi dipilih karena menjamin invariant BR-AUTH-007 tanpa pernah bisa menghasilkan keadaan salah: `.env` bertuliskan `Admin@Oddo.Local` tetap cocok dengan baris yang dibuat seed. Menolaknya hanya memindahkan masalah ke waktu boot | Ditutup unit test "lower-cases ADMIN_EMAIL". Kalau Mentor ingin penolakan keras, perubahannya satu baris |
| D-2 | `apps/api/test/setup-db.ts` diganti nama jadi `setup-state.ts` | §15 menyuruh menambahkan pembersihan key Redis ke helper test. File bernama `setup-db` yang juga menghapus key Redis adalah nama yang berbohong | Hanya nama file + satu baris di `jest.config.ts` |

**Catatan implementasi yang bukan deviasi, tapi sebaiknya diketahui:**

- `RedisService` mendapat getter `connection` yang mengembalikan klien ioredis. `SessionService`
  butuh `MULTI`, dan membungkus tiap perintah Redis jadi method passthrough akan menambah
  lapisan yang tidak memuat satu keputusan pun.
- `SessionService.destroy()` mengembalikan `userId` (atau `null`) supaya §12.1 bisa mencatat
  `auth.logout` atas nama seseorang.
- `@CurrentUser()` diletakkan di `common/decorators/` — persis seperti peta folder `ADR-0002` §1.
  Tipe `RequestAuth` ikut tinggal di `common/context/`, sehingga `common` tidak perlu mengimpor
  apa pun dari `core` dan arah dependency tetap benar.
- Tabel dinamai `user` sesuai §7.2. `user` adalah kata kunci di Postgres; ini aman karena Prisma
  selalu mengutip identifier, tapi **raw SQL apa pun yang ditulis tangan wajib menulis `"user"`**.

**Tidak ada TODO, mock, atau stub yang tersisa.**

**Dependency yang ditambahkan:** `@node-rs/argon2` (disebut §2.4), `cookie-parser` +
`@types/cookie-parser` (disebut §13 langkah 9), dan `@radix-ui/react-label` — prasyarat
komponen shadcn `label` yang diminta §10, sama seperti `@radix-ui/react-slot` untuk `button`
di PRD-000.

---

**Hal yang perlu diputuskan Mentor untuk PRD berikutnya:**

1. **Waktu respons login membocorkan email mana yang terdaftar.** BR-AUTH-002 dipenuhi untuk
   *isi* respons, dan itu yang diuji. Tapi email yang tidak terdaftar tidak pernah sampai ke
   argon2, jadi jawabannya kembali jauh lebih cepat (~1 ms vs ~100 ms). Menutupnya butuh
   verifikasi dummy terhadap hash palsu. Sengaja tidak dikerjakan karena tidak diminta PRD —
   layak diputuskan bersama rate limiting dan lockout yang sudah ditunda ke V1.
2. **PRD-001b harus menaikkan `AuthGuard` jadi `APP_GUARD`.** Saat itu terjadi, setiap endpoint
   yang belum ditandai akan tertutup. Yang sudah punya `@Public()` hari ini: `GET /api/health`,
   `POST /api/auth/login`, `POST /api/auth/logout`. Endpoint lain belum ada.
3. **`listByUser()` belum punya permukaan HTTP.** Ia sudah diuji langsung (4 test), tapi
   pemakainya baru lahir di PRD-002 saat user dinonaktifkan dan seluruh session-nya dicabut.
4. **Konstanta nilai `APP_VERSION` (`'0.1.0'`) masih tinggal di seed.** Temuan F-3 menyebut
   *key* `app.version` yang terduplikasi, dan itu yang disatukan. Kalau nilainya juga ingin
   dibaca tempat lain, ia perlu rumah sendiri.
5. **`package.json#prisma` masih deprecated** (warisan PRD-000). Setiap perintah Prisma
   mencetak peringatan; pindah ke `prisma.config.ts` saat upgrade Prisma 7.
6. **Butir 5 dan 6 `PRODUCT-SCOPE` §4.1** (plugin ESLint React/Next, dan Playwright) memang
   dialokasikan ke PRD-001b dan belum dikerjakan di sini.

---

**Cara menjalankan & menguji:**

```bash
pnpm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
pnpm docker:up
pnpm db:migrate
pnpm db:seed                    # membuat Default Company + admin
pnpm dev
```

Buka <http://localhost:3000/login> dan masuk dengan `admin@oddo.local` / `ChangeMe!2026`.

```bash
# gerbang kualitas (keempatnya harus exit 0)
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# pemeriksaan manual backend
curl -i -c /tmp/cj -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@oddo.local","password":"ChangeMe!2026"}'      # 200 + Set-Cookie

curl -b /tmp/cj http://localhost:3001/api/auth/me                    # 200, identitas
curl -X POST -b /tmp/cj http://localhost:3001/api/auth/logout -i     # 204 + Max-Age=0
curl -b /tmp/cj http://localhost:3001/api/auth/me                    # 401

# konfigurasi TTL yang tidak masuk akal (AC-001a-11)
# set SESSION_ABSOLUTE_TTL_HOURS=1 di .env, lalu:
pnpm --filter @oddo/api run check:env                                # exit 1, menyebut kedua variable
```
