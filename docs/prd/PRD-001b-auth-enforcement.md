---
id: PRD-001b
title: Auth — guard global, proteksi route di web, timing attack, dan E2E Playwright
status: in-progress
priority: P0
modules: [core]
depends_on: [PRD-001a]
blocks: [PRD-002]
estimasi: ~8 jam / 1 sesi coder — dua checkpoint wajib, setelah langkah 6 dan langkah 12
created: 2026-09-16
updated: 2026-09-16
---

# PRD-001b — Auth: Tidak Bisa Dilewati

> Pembaca dokumen ini adalah engineer yang **belum pernah ikut diskusi apa pun**
> tentang project ini. Semua yang dia butuhkan harus ada di sini.
>
> **Wajib dibaca sebelum mulai:** `docs/prd/PRD-001a-auth-login.md` (terutama §2.4, §9,
> dan §12.1), `docs/adr/ADR-0004-composition-root-aplikasi.md` (dua kanal pendaftaran
> + urutan guard/interceptor), `docs/adr/ADR-0005-konfigurasi-environment-dan-lingkungan-test.md`
> (§4 lingkungan test), dan `docs/adr/ADR-0002-arsitektur-inti.md` §3.

---

## 1. Ringkasan

PRD-001a membuat orang **bisa** login. PRD ini membuat login **tidak bisa dilewati**:
`AuthGuard` dinaikkan jadi guard global sehingga setiap endpoint tertutup kecuali yang
ditandai `@Public()` secara eksplisit, `apps/web` mengalihkan pengunjung yang belum
login ke `/login`, halaman health pindah ke `/health` dan tetap publik, dan seluruh
alur dibuktikan oleh E2E Playwright di browser sungguhan.

Dua pekerjaan lain ikut di sini karena keduanya baru relevan setelah ada aplikasi
tertutup: menutup **timing attack** pada endpoint login (janji BR-AUTH-002 di PRD-001a
yang masih bocor lewat waktu respons), dan memasang plugin ESLint React/Next sebelum
jumlah halaman bertambah.

**Masalah yang diselesaikan:** hari ini aplikasi punya pintu tapi tidak punya dinding.
`AuthGuard` hanya terpasang di `/api/auth/me`; endpoint lain mana pun yang ditambahkan
PRD-002 akan terbuka kecuali seseorang ingat memasang guard-nya satu per satu. Lupa
memasang guard tidak boleh berarti endpoint terbuka — `ADR-0002` §3 menyatakan itu, dan
sampai PRD ini selesai, pernyataan itu belum ditegakkan apa pun.

---

## 2. Scope

### 2.1 Termasuk (In Scope)

- [ ] `AuthGuard` didaftarkan sebagai `APP_GUARD` global (Kanal 2 `ADR-0004`)
- [ ] `@Public()` benar-benar dibaca guard; endpoint tanpa penanda jadi tertutup
- [ ] Timing attack pada `POST /api/auth/login` ditutup dengan verifikasi dummy
      (`PRODUCT-SCOPE` §4.2 butir 7)
- [ ] `apps/web`: `middleware.ts` yang mengalihkan pengunjung tanpa cookie ke `/login`
- [ ] `apiFetch()` menangani 401 dengan redirect ke `/login?next=<path aman>`
- [ ] Validasi ketat parameter `next` — hanya path relatif, lihat BR-AUTH-011
- [ ] Halaman `/` jadi **home terproteksi** dengan header shell (nama app, nama user,
      tombol Logout)
- [ ] Halaman health pindah dari `/` ke `/health` dan **tetap publik**
- [ ] `/login` mengalihkan ke `/` kalau dibuka oleh pengunjung yang sudah punya cookie
- [ ] Loading state di halaman terproteksi — tidak pernah konten kosong (BR-AUTH-012)
- [ ] Playwright dari nol: config, `webServer` dua proses di port sendiri,
      `reuseExistingServer: false`, seed, dan alur E2E login → home → logout → ditolak
- [ ] Plugin ESLint React & Next (`PRODUCT-SCOPE` §4.1 butir 5)
- [ ] Script `pnpm test:e2e` + baris baru di tabel "Perintah penting" `CLAUDE.md`

### 2.2 Tidak Termasuk (Out of Scope)

| Yang tidak dibuat | Ditunda ke |
|---|---|
| `@RequirePermission`, `PermissionGuard`, role, permission | PRD-002 |
| **Pemeriksaan saat boot** bahwa setiap route punya `@RequirePermission` atau `@Public()` (`ADR-0002` §3) | PRD-002 — pemeriksaan itu butuh `@RequirePermission` yang belum ada, jadi kalau dipasang sekarang ia akan menolak boot untuk endpoint yang memang sah |
| Audit log tabel | PRD-002 |
| Rate limiting & lockout percobaan login | V1 |
| Reset password, ganti password, "remember me" | PRD-002 / Future |
| Sidebar, menu, navigasi antar modul | PRD-002 — menunggu ada layar yang nyata untuk dinavigasi |
| Refresh token, SSO | Future |

### 2.3 Asumsi

- PRD-001a sudah `done`: `AuthGuard`, `SessionService`, `apiFetch`, halaman `/login`,
  tabel `user` dan `company`, serta seed admin sudah ada dan hijau.
- Docker berjalan; `oddo_dev` dan `oddo_test` dua-duanya ada (`ADR-0005` §4).
- Developer menjalankan E2E di mesinnya sendiri. Belum ada CI (`PRODUCT-SCOPE` §3, V1).

### 2.4 Konvensi tetap — nilai konkret, bukan saran

**Port E2E** — sengaja berbeda dari development supaya keduanya bisa hidup bersamaan:

| Proses | Development | E2E |
|---|---|---|
| `apps/web` | 3000 | **3100** |
| `apps/api` | 3001 | **3101** |
| Database | `oddo_dev` | **`oddo_test`** |
| Redis | index `/0` | **index `/1`** |

**Sumber env untuk E2E:** `playwright.config.ts` memuat `.env.test` dengan
`override: true`, lalu menimpa **tiga** nilai saja lewat `webServer.env`:
`PORT=3101`, `WEB_ORIGIN=http://localhost:3100`, dan
`NEXT_PUBLIC_API_URL=http://localhost:3101/api`.

**Tidak boleh dibuat file `.env.e2e`.** `ADR-0005` §1 menetapkan hanya ada tiga file env
(`.env`, `.env.example`, `.env.test`), dan file keempat akan segera berbeda isinya dari
yang lain tanpa ada yang menyadari. Penimpaan tiga nilai di atas dilakukan di dalam
config Playwright, bukan di file baru.

**Daftar publik — satu-satunya, dan kedua sisi wajib sama:**

| Permukaan | Yang publik |
|---|---|
| API (`@Public()`) | `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Web (matcher middleware) | `/login`, `/health`, aset statis (`/_next/*`, `/favicon.ico`) |

Semua path lain tertutup di dua-duanya.

---

## 3. Dependency

| Arah | Item | Keterangan |
|---|---|---|
| Butuh | PRD-001a | Guard, session, cookie, halaman login, seed admin |
| Memblokir | PRD-002 | RBAC menumpang di atas guard global ini; `PermissionGuard` dipasang dengan cara yang sama |

**ADR yang mengikat PRD ini:**

| ADR | Aturan spesifik |
|---|---|
| `ADR-0002` §3 | Endpoint tanpa penanda **tidak boleh** terbuka. Lupa memasang guard tidak boleh berarti endpoint publik |
| `ADR-0004` Kanal 2 | `AuthGuard` butuh DI → didaftarkan sebagai provider `APP_GUARD` di module pemiliknya, **bukan** `useGlobalGuards(new AuthGuard())` dan **bukan** di `main.ts` |
| `ADR-0004` urutan | Guard berjalan sebelum interceptor; guard menaruh hasil di objek request, interceptor mengangkatnya ke `RequestContext` |
| `ADR-0005` §1 | Hanya tiga file env. E2E tidak boleh menambah file keempat |
| `ADR-0005` §4 | Test — termasuk E2E — memakai `oddo_test` dan Redis index `/1`. **Tidak pernah** menyentuh `oddo_dev` |
| `ADR-0001` B7 | E2E memakai Playwright |
| `ADR-0001` B8 | 401 memakai envelope standar dengan `code: UNAUTHORIZED` |

---

## 4. User Story

```text
US-001b-01

Title:   Aplikasi tertutup secara bawaan
As a:    pemilik sistem
I want:  endpoint dan halaman baru tertutup kecuali sengaja dibuka
So that: satu kelalaian memasang guard tidak berubah jadi kebocoran data
Priority: MVP
```

```text
US-001b-02

Title:   Diantar ke tempat yang saya tuju
As a:    karyawan yang mengeklik tautan ke halaman dalam aplikasi
I want:  setelah login, saya sampai di halaman yang tadi saya tuju
So that: saya tidak perlu mencarinya lagi dari awal
Priority: MVP
```

```text
US-001b-03

Title:   Melihat status infrastruktur justru saat sedang bermasalah
As a:    developer yang sedang menelusuri gangguan
I want:  halaman /health bisa dibuka tanpa login
So that: saat Redis mati dan tidak ada yang bisa login, saya masih bisa melihat sebabnya
Priority: MVP
```

```text
US-001b-04

Title:   Keluar dari aplikasi lewat layar
As a:    karyawan
I want:  tombol Logout yang selalu terlihat
So that: saya tidak perlu menghapus cookie manual untuk keluar
Priority: MVP
```

---

## 5. Business Workflow & State Machine

**Tidak berlaku sebagai state machine dokumen** — PRD ini tidak membuat dokumen bisnis.
Yang perlu digambarkan adalah **alur keputusan satu request halaman**, karena di situlah
letak keputusan desain yang paling mudah disalahpahami:

```text
  Pengunjung membuka /sesuatu
             │
             ▼
   ┌───────────────────────┐   tidak ada cookie
   │ middleware apps/web   ├─────────────────────► redirect 307 ke /login?next=/sesuatu
   │ (UX guard, BUKAN      │
   │  batas keamanan)      │   ada cookie (isinya TIDAK diperiksa)
   └───────────┬───────────┘
               ▼
      Halaman dirender dalam LOADING STATE
               │
               ▼
     apiFetch('/auth/me') ──────► API: AuthGuard (batas keamanan sesungguhnya)
               │                        │
     200       │                        │ 401 (session mati / dicabut / lewat batas absolut)
               ▼                        ▼
      Konten ditampilkan        apiFetch melempar 401
                                        │
                                        ▼
                             redirect ke /login?next=/sesuatu
```

**Middleware tidak pernah tahu apakah session masih hidup.** Ia berjalan di Edge runtime,
tidak punya akses ke Redis, dan hanya melihat ada atau tidaknya cookie. Itu bukan
kekurangan implementasi — itu memang batas kemampuannya, dan §6 BR-AUTH-010 menuliskannya
sebagai aturan supaya tidak ada yang keliru mengandalkannya.

---

## 6. Business Rules

```text
BR-AUTH-008

Setiap endpoint API tertutup secara bawaan. Endpoint hanya terbuka kalau
ditandai @Public() secara eksplisit.

Berlaku saat  : setiap request ke /api/**
Jika dilanggar: 401 UNAUTHORIZED dengan envelope standar ADR-0001 B8
```

```text
BR-AUTH-009

Endpoint login tidak boleh membocorkan email mana yang terdaftar lewat
waktu respons. Email yang tidak ditemukan tetap melewati satu verifikasi
argon2id terhadap hash dummy tetap.

Berlaku saat  : POST /api/auth/login dengan email yang tidak ada di database
Jika dilanggar: halaman login bisa dipakai memetakan siapa saja yang punya akun,
                dan janji BR-AUTH-002 hanya berlaku di atas kertas
```

```text
BR-AUTH-010

Middleware apps/web adalah UX guard, BUKAN batas keamanan. Ia hanya memeriksa
keberadaan cookie, tidak pernah keabsahannya. Satu-satunya batas keamanan
adalah AuthGuard global di API.

Berlaku saat  : setiap request halaman
Jika dilanggar: seseorang akan menambahkan endpoint tanpa @Public() lalu mengira
                middleware sudah menjaganya — padahal middleware tidak pernah
                menyentuh request API sama sekali
```

```text
BR-AUTH-011

Parameter redirect balik hanya boleh berisi path relatif yang diawali tepat
satu "/" dan bukan "//" atau "/\". Nilai lain diabaikan dan redirect jatuh ke "/".

Berlaku saat  : membaca ?next= di halaman login, DAN saat menyusunnya di apiFetch
Jika dilanggar: halaman login jadi open redirect — tautan
                /login?next=https://phishing.example yang dikirim ke karyawan
                akan memantulkan mereka ke situs penyerang setelah login berhasil,
                lengkap dengan kesan bahwa itu bagian dari aplikasi kita
```

```text
BR-AUTH-012

Halaman terproteksi tidak pernah menampilkan konten kosong. Selama identitas
belum dipastikan, halaman menampilkan loading state; setelah 401 barulah
redirect terjadi.

Berlaku saat  : cookie ada tapi session sudah mati, dicabut, atau lewat batas absolut
Jika dilanggar: user melihat layar kosong tanpa penjelasan di antara render dan
                redirect — gejala yang selalu dilaporkan sebagai "aplikasinya blank"
```

---

## 7. Data Model

**Tidak berlaku** — PRD ini tidak menambah, mengubah, atau menghapus tabel mana pun.
Tidak ada file migrasi baru.

Kalau sesi Coder merasa butuh tabel di sini, itu tanda ada yang salah dipahami:
tulis di bagian Open Questions dan set `status: blocked`.

---

## 8. Permission

Sistem permission (`role`, `permission`, `@RequirePermission`) tetap **PRD-002**.
Yang berlaku setelah PRD ini:

| Endpoint | Setelah guard global | Alasan |
|---|---|---|
| `GET /api/health` | `@Public()` | Monitoring harus bisa memanggilnya sebelum ada user mana pun |
| `POST /api/auth/login` | `@Public()` | Mustahil login kalau login butuh login |
| `POST /api/auth/logout` | `@Public()` | Tombol logout tidak boleh gagal; cookie basi tetap dijawab 204 (PRD-001a §9) |
| `GET /api/auth/me` | tertutup | Penanda `@UseGuards(AuthGuard)` lokal **dihapus** — guard global sudah mencakupnya. Membiarkan keduanya berarti guard jalan dua kali |
| endpoint lain | tertutup | Belum ada. Setiap endpoint PRD-002 lahir dalam keadaan tertutup |

**Record rule** belum berlaku — filter `company_id` masuk PRD-002.

---

## 9. API Contract

PRD ini **tidak menambah endpoint**. Yang berubah adalah perilaku yang sudah ada.

### Perubahan pada `POST /api/auth/login`

Kontraknya (request, response 200, bentuk error) **tidak berubah sama sekali**. Yang
berubah hanya jalur internal untuk email yang tidak ditemukan:

```text
SEBELUM: user tidak ditemukan → langsung lempar 401         (~1 ms)
SESUDAH: user tidak ditemukan → verifikasi argon2id terhadap
         DUMMY_PASSWORD_HASH → buang hasilnya → lempar 401  (~100 ms)
```

`DUMMY_PASSWORD_HASH` adalah satu konstanta hash argon2id yang dibangkitkan sekali dari
string acak dan ditulis di kode. Ia tidak pernah cocok dengan password apa pun, dan
parameternya wajib sama persis dengan §2.4 PRD-001a — hash dengan `memoryCost` berbeda
akan memakan waktu berbeda pula, dan kebocorannya kembali.

### Perubahan pada semua endpoint lain

| HTTP | Code | Kapan terjadi |
|---|---|---|
| 401 | `UNAUTHORIZED` | Request tanpa cookie, atau cookie yang session-nya tidak ada / kedaluwarsa / lewat batas absolut, ke endpoint yang tidak `@Public()` |

Bentuk body-nya tetap envelope `ADR-0001` B8 — dirakit `AllExceptionsFilter`, bukan oleh
guard.

---

## 10. UI/UX Requirements

### Peta halaman setelah PRD ini

| Path | Akses | Isi |
|---|---|---|
| `/` | **tertutup** | Home: sapaan berisi nama user, dan tautan ke `/health`. Sengaja tipis — layar yang sebenarnya datang di PRD-002 |
| `/login` | publik | Halaman login PRD-001a. Kalau pengunjung sudah punya cookie, alihkan ke `/` |
| `/health` | **publik** | Halaman health PRD-000, dipindahkan apa adanya dari `/` |

### Header shell

| Aspek | Ketentuan |
|---|---|
| Muncul di | Semua halaman tertutup (`/` dan halaman PRD-002 berikutnya). **Tidak** di `/login` dan **tidak** di `/health` |
| Isi | Kiri: `Oddo ERP`. Kanan: nama user + tombol `Keluar` |
| Saat identitas belum datang | Nama user diganti `Skeleton` — bukan string kosong, bukan teks "Loading" |
| Tombol Keluar | Memanggil `POST /api/auth/logout`, lalu mengarahkan ke `/login`. Gagal pun tetap mengarahkan ke `/login` — logout yang macet lebih buruk daripada logout yang dianggap berhasil |
| Responsif | Terbaca di lebar 400px; nama user boleh dipotong dengan ellipsis |

### Loading state halaman terproteksi (BR-AUTH-012)

| Aspek | Ketentuan |
|---|---|
| Selama `/auth/me` berjalan | Header shell muncul dengan skeleton, isi halaman muncul sebagai skeleton. Tidak ada layar putih |
| Setelah 200 | Konten muncul |
| Setelah 401 | `router.replace('/login?next=<path sekarang>')`. Konten asli **tidak pernah** sempat tampil |

### Halaman `/login`

Tambahan atas PRD-001a §10:

| Aspek | Ketentuan |
|---|---|
| Sudah punya cookie | Middleware mengalihkan ke `/` sebelum halaman dirender |
| `?next=` sah | Setelah login berhasil, arahkan ke path itu |
| `?next=` tidak sah | Diabaikan diam-diam, arahkan ke `/`. Jangan menampilkan pesan error — ini bukan kesalahan user, dan menampilkannya hanya memberi umpan balik kepada orang yang sedang mencoba-coba |

---

## 11. Edge Cases & Error Handling

| # | Skenario | Perilaku yang benar |
|---|---|---|
| 1 | Cookie ada, session sudah dicabut | Middleware meloloskan → halaman merender loading state → `/me` 401 → redirect ke `/login?next=<path>`. Tidak pernah ada konten kosong (BR-AUTH-012) |
| 2 | `?next=https://contoh.com` | Diabaikan, redirect ke `/` (BR-AUTH-011) |
| 3 | `?next=//contoh.com` | Diabaikan, redirect ke `/`. Ini protocol-relative URL — browser membacanya sebagai host eksternal |
| 4 | `?next=/\contoh.com` | Diabaikan, redirect ke `/`. Sebagian browser memperlakukan `\` seperti `/` |
| 5 | `?next=%2F%2Fcontoh.com` | Diabaikan — `URLSearchParams` sudah men-decode-nya jadi `//contoh.com` sebelum divalidasi |
| 6 | `?next=/login` | Diabaikan, redirect ke `/`. Kalau diturut, user berputar kembali ke halaman login setelah berhasil login |
| 7 | Redis mati saat membuka halaman tertutup | `/me` menjawab 500, **bukan** 401 (`ADR-0001` B8 amandemen). Halaman menampilkan pesan gangguan, **tidak** mengalihkan ke `/login` — mengalihkan akan membuat user mencoba login berulang kali untuk masalah yang tidak ada hubungannya dengan kredensial |
| 8 | User menekan tombol Back setelah logout | Middleware tidak menemukan cookie → redirect ke `/login`. Halaman dari bfcache tidak boleh menampilkan data lama |
| 9 | `pnpm dev` sedang jalan saat `pnpm test:e2e` dijalankan | Keduanya hidup berdampingan: dev di 3000/3001 memakai `oddo_dev`, E2E di 3100/3101 memakai `oddo_test`. Dibuktikan AC-001b-11 |
| 10 | Sisa server E2E dari run sebelumnya masih hidup di 3100/3101 | `reuseExistingServer: false` membuat Playwright menolak memakainya dan gagal dengan jelas, alih-alih diam-diam menguji server ber-env salah |
| 11 | `pnpm test` (Jest) dan `pnpm test:e2e` dijalankan bersamaan | **Tidak didukung.** Keduanya memakai `oddo_test`, dan Jest mem-`TRUNCATE` tabel di awal tiap file. README wajib menyebutkan ini; `pnpm test` tidak memanggil E2E |
| 12 | Endpoint baru ditambahkan tanpa penanda apa pun | Tertutup (BR-AUTH-008). Ini perilaku yang benar, bukan bug |

---

## 12. Audit Trail & Non-Functional

### 12.1 Audit

Tabel `audit_log` tetap PRD-002. Logging terstruktur PRD-001a §12.1 berlaku tanpa
perubahan, dengan satu tambahan:

| Kejadian | Level | Yang dicatat |
|---|---|---|
| Request ditolak guard global | `debug` | `event: auth.request.unauthenticated`, `path`, `requestId`. **Tanpa** session id dan tanpa isi cookie |

Level `debug`, bukan `warn`: setelah aplikasi tertutup, request tanpa session adalah
kejadian sehari-hari (monitoring, tab lama, bot) dan tidak layak membanjiri log level
`warn` yang dipakai `.env.test`.

### 12.2 Non-functional

| Aspek | Target |
|---|---|
| Biaya guard global per request | 2 perintah Redis, 0 query Postgres — sama seperti PRD-001a, hanya cakupannya yang meluas |
| Latency login untuk email tidak terdaftar | **Sekelas** dengan email terdaftar. Target: median selisihnya di bawah 50% dari median jalur terdaftar (AC-001b-03) |
| Waktu `pnpm test:e2e` | < 3 menit di mesin developer, termasuk menyalakan kedua server |
| Waktu `pnpm test` | tetap < 60 detik — E2E **tidak** masuk ke dalamnya |
| Overhead middleware | Hanya membaca header cookie; tidak ada I/O |

---

## 13. Rencana Implementasi

**Bagian A — API tertutup (langkah 1–6).**

1. Daftarkan `AuthGuard` sebagai `{ provide: APP_GUARD, useClass: AuthGuard }` di
   `AuthModule` (`ADR-0004` Kanal 2). Hapus `@UseGuards(AuthGuard)` lokal di
   `/auth/me` supaya guard tidak berjalan dua kali.
2. Pastikan guard membaca metadata `@Public()` lewat `Reflector`, memeriksa **handler
   dan class** (`getAllAndOverride`), dan melewatkan request yang ditandai.
3. Tandai `@Public()` pada `POST /api/auth/login` dan `POST /api/auth/logout` kalau
   belum. `GET /api/health` sudah ditandai sejak PRD-000 — verifikasi, jangan diasumsikan.
4. Tambahkan `DUMMY_PASSWORD_HASH` di `password.service.ts`: konstanta hash argon2id
   dengan parameter §2.4 PRD-001a, plus method `verifyDummy()` yang menjalankan
   verifikasi terhadapnya dan membuang hasilnya.
5. Di `auth.service.ts`, jalur "user tidak ditemukan" dan "user nonaktif" memanggil
   `verifyDummy()` sebelum melempar 401 (BR-AUTH-009). Jalur "password salah" sudah
   melewati argon2 dengan sendirinya.
6. Test bagian A: guard menutup endpoint tanpa penanda, `@Public()` tetap terbuka,
   `/auth/me` masih bekerja, dan `verifyDummy` benar-benar terpanggil untuk email asing.

   > ### CHECKPOINT 1 — aman berhenti di sini
   > API sudah tertutup dan bisa di-commit. `curl` ke endpoint tanpa cookie dijawab 401
   > berbentuk standar, tiga endpoint publik tetap jalan. Yang tersisa adalah web dan E2E.

**Bagian B — web (langkah 7–12).**

7. `apps/web/src/lib/safe-next.ts`: `resolveNextPath(raw)` yang menegakkan BR-AUTH-011.
   Fungsi murni, tanpa dependensi — mudah diuji dan dipakai dua sisi.
8. `apps/web/src/middleware.ts`: kalau cookie `oddo_session` tidak ada dan path tidak
   publik, `NextResponse.redirect` ke `/login?next=<path+query sekarang>`. Kalau cookie
   ada dan path adalah `/login`, alihkan ke `/`. Matcher mengecualikan `/_next/*`,
   `/favicon.ico`, dan `/health`.
9. `apiFetch()`: saat menerima 401, arahkan ke `/login?next=<path sekarang>` lewat
   `window.location` atau router. Jangan menelan status lain.
10. Pindahkan halaman health dari `src/app/page.tsx` ke `src/app/health/page.tsx`
    **apa adanya** — jangan sekalian mendesain ulang.
11. `src/components/app-header.tsx` dan `src/app/page.tsx` baru: home terproteksi dengan
    sapaan nama user, skeleton selama `/me` berjalan (BR-AUTH-012), dan tombol `Keluar`.
12. Halaman `/login` membaca `?next=` lewat `resolveNextPath()` dan memakainya setelah
    login berhasil.

   > ### CHECKPOINT 2 — aman berhenti di sini
   > Aplikasi sudah tertutup dari dua sisi dan bisa dicoba manusia. Yang tersisa adalah
   > E2E dan pagar lint.

**Bagian C — E2E dan pagar (langkah 13–16).**

13. Pasang Playwright di `apps/web`. `playwright.config.ts`:
    - memuat `.env.test` dengan `override: true`
    - `webServer` berisi **dua** entri (api lalu web), keduanya
      `reuseExistingServer: false`, dengan `env` yang menimpa `PORT`, `WEB_ORIGIN`, dan
      `NEXT_PUBLIC_API_URL` sesuai §2.4
    - `baseURL: 'http://localhost:3100'`, `timeout` webServer 120 detik
    - `globalSetup` yang menjalankan `prisma migrate deploy` + `seedSystem` ke `oddo_test`
14. Satu file E2E `e2e/auth.spec.ts` yang menempuh alur sungguhan: buka `/` tanpa cookie
    → mendarat di `/login?next=%2F` → login → mendarat di `/` dan nama admin terlihat →
    buka `/health` → tekan `Keluar` → mendarat di `/login` → buka `/` lagi → ditolak lagi.
15. Script `test:e2e` di `apps/web` dan di root; tambahkan barisnya ke tabel
    "Perintah penting" `CLAUDE.md` dan ke `README.md` beserta peringatan §11 no. 11.
16. Plugin ESLint React & Next di `packages/config/eslint.base.mjs`, lalu bereskan
    temuan yang muncul sampai `pnpm lint --max-warnings=0` hijau lagi.
    Terakhir: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` —
    kelimanya exit 0. Perbarui `docs/prd/README.md` dan isi bagian catatan Coder di bawah.

**Urutan commit yang disarankan:** guard global → timing attack → safe-next + middleware
→ apiFetch 401 → pemindahan health → header + home → Playwright → plugin ESLint.

---

## 14. Acceptance Criteria

```text
AC-001b-01  Endpoint tertutup secara bawaan

Given: API berjalan dan tidak ada cookie yang dikirim
When:  GET /api/auth/me dipanggil tanpa cookie
Then:  status 401 dengan code UNAUTHORIZED dan envelope enam field ADR-0001 B8
When:  sebuah controller khusus test yang TIDAK ditandai @Public() dipanggil tanpa cookie
Then:  status 401 juga — tanpa satu baris kode pun ditambahkan di controller itu
```

```text
AC-001b-02  Endpoint publik tetap terbuka setelah guard global

Given: guard global aktif
When:  GET /api/health, POST /api/auth/login, dan POST /api/auth/logout dipanggil
       tanpa cookie
Then:  ketiganya TIDAK menjawab 401 — health 200, login 200/401 sesuai kredensial,
       logout 204
```

```text
AC-001b-03  Timing attack pada login ditutup

Bagian (a) mengikat. Bagian (b) melengkapi.

(a) STRUKTURAL — deterministik
Given: PasswordService di-spy di dalam test
When:  login dikirim dengan email yang TIDAK ada di database
Then:  verifikasi argon2id tetap terpanggil tepat satu kali sebelum 401 dilempar

(b) WAKTU — toleran terhadap mesin
Given: admin terdaftar
When:  5 request login dengan email tidak terdaftar dan 5 request dengan email
       admin + password salah dikirim bergantian, dan waktunya dicatat
Then:  median jalur "email tidak terdaftar" >= 50% dari median jalur "password salah".
       Ambang ini sengaja longgar: yang dibuktikan adalah kedua jalur sama-sama
       melewati argon2, bukan bahwa keduanya identik sampai milidetik
```

```text
AC-001b-04  Middleware mengalihkan pengunjung tanpa cookie

Given: apps/web berjalan dan browser tidak punya cookie oddo_session
When:  http://localhost:3100/ dibuka
Then:  browser mendarat di /login dengan query next=%2F,
       dan konten halaman home TIDAK pernah terlihat
```

```text
AC-001b-05  Parameter next hanya menerima path relatif

Given: halaman /login dibuka dengan berbagai nilai ?next=
When:  login berhasil
Then:  tujuan akhirnya adalah:

       ?next=/settings/users     -> /settings/users
       ?next=https://contoh.com  -> /
       ?next=//contoh.com        -> /
       ?next=/\contoh.com        -> /
       ?next=/login              -> /
       ?next= (kosong)           -> /
       tanpa ?next=              -> /

       Keempat nilai yang ditolak TIDAK menghasilkan pesan error apa pun di layar
```

```text
AC-001b-06  Cookie ada tapi session sudah mati

Given: user login, lalu session-nya dihapus dari Redis dari luar
       (mensimulasikan pencabutan), sementara cookie di browser tetap ada
When:  halaman / dibuka
Then:  halaman menampilkan LOADING STATE lebih dulu — bukan layar kosong,
       bukan konten home,
       lalu setelah /auth/me menjawab 401 browser mendarat di /login?next=%2F
```

```text
AC-001b-07  Halaman health publik dan tetap berfungsi

Given: browser tanpa cookie sama sekali
When:  /health dibuka
Then:  halaman tampil lengkap dengan status Database dan Redis,
       tidak ada redirect ke /login,
       dan header shell dengan tombol Keluar TIDAK muncul di halaman ini
```

```text
AC-001b-08  Logout lewat layar

Given: user sudah login dan berada di /
When:  tombol "Keluar" ditekan
Then:  browser mendarat di /login,
       session-nya hilang dari Redis,
       dan membuka / lagi mengembalikan pengunjung ke /login
```

```text
AC-001b-09  Sudah login tapi membuka /login

Given: browser punya cookie oddo_session
When:  /login dibuka langsung
Then:  browser dialihkan ke / tanpa menampilkan form login
```

```text
AC-001b-10  E2E menempuh alur sungguhan di browser

Given: `pnpm test:e2e` dijalankan pada repo bersih
When:  suite Playwright selesai
Then:  exit code 0, dan alur berikut terbukti dalam satu test:
       buka / tanpa cookie -> mendarat di /login?next=%2F
       -> login dengan admin dari .env.test -> mendarat di / dan nama "Administrator"
       terlihat -> buka /health tanpa masalah -> tekan Keluar -> mendarat di /login
       -> buka / lagi -> kembali ditolak ke /login
```

```text
AC-001b-11  E2E tidak menyentuh database development

Given: `pnpm dev` SEDANG BERJALAN (api 3001, web 3000) dengan oddo_dev yang sudah di-seed
When:  isi oddo_dev di-hash (count + md5 seluruh baris tabel system_setting, company,
       dan "user"), lalu `pnpm test:e2e` dijalankan sampai selesai, lalu di-hash lagi
Then:  E2E hijau,
       kedua hash IDENTIK — tidak satu baris pun di oddo_dev berubah,
       dan selama E2E berjalan ada proses yang mendengarkan di port 3100 DAN 3101,
       yang membuktikan Playwright menyalakan servernya sendiri alih-alih memakai
       server dev yang sedang hidup

Catatan: tabel "user" wajib ditulis dalam tanda kutip di SQL — `user` adalah kata
kunci Postgres (ADR-0002 §4 amandemen).
```

```text
AC-001b-12  Playwright menolak memakai server yang sudah ada

Given: playwright.config.ts
When:  isinya diperiksa
Then:  kedua entri webServer memuat reuseExistingServer: false secara eksplisit,
       dan port yang dipakai adalah 3100 (web) serta 3101 (api) — bukan 3000/3001
```

```text
AC-001b-13  Redis mati tidak membuat user terlihat ter-logout

Given: user sudah login, lalu Redis dimatikan
When:  halaman / dibuka
Then:  /auth/me menjawab 500 (bukan 401),
       dan halaman menampilkan pesan gangguan — TIDAK mengalihkan ke /login
```

```text
AC-001b-14  Pagar kualitas hijau, termasuk plugin baru

Given: seluruh implementasi PRD ini selesai
When:  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, dan `pnpm test:e2e`
       dijalankan
Then:  kelimanya exit code 0,
       `pnpm lint` sudah menjalankan aturan react-hooks dan @next/next
       (dibuktikan dengan menyisipkan pelanggaran hooks sementara sampai lint merah,
       lalu menghapusnya),
       tidak ada eslint-disable baru,
       dan laporan test menunjukkan 0 skipped dan 0 todo
```

---

## 15. Test Plan

| Level | Yang diuji | Catatan |
|---|---|---|
| Unit (web) | `resolveNextPath()`: path sah, `https://`, `//`, `/\`, `%2F%2F`, `/login`, string kosong, `null` | Fungsi murni — ini pagar utama BR-AUTH-011 |
| Unit (api) | `verifyDummy()` memakai parameter argon2 yang sama dengan `hash()` | Parameter berbeda = kebocoran waktu kembali |
| Integration (api) | Endpoint tanpa penanda → 401; `@Public()` → lolos; `/auth/me` dengan cookie → 200 | Controller khusus test, pola PRD-000 |
| Integration (api) | AC-001b-03 (a): spy memastikan argon2 terpanggil untuk email asing | Deterministik |
| Integration (api) | AC-001b-03 (b): perbandingan median waktu | 5 sampel per jalur, ambang longgar |
| Integration (api) | Redis mati → 500, bukan 401, untuk endpoint tertutup | `REDIS_URL` ke port mati |
| Unit (web) | Header shell: skeleton saat loading, nama user setelah 200, tombol Keluar memanggil logout lalu mengarahkan | `fetch` dan `next/navigation` di-mock |
| Unit (web) | Home terproteksi: loading state lebih dulu, redirect setelah 401 (BR-AUTH-012) | Bukti AC-001b-06 di level komponen |
| E2E (Playwright) | Alur AC-001b-10 utuh di browser | Satu test yang menempuh seluruh alur, bukan enam test terpisah |
| Manual sekali | AC-001b-11 (isolasi dari `oddo_dev`) dan AC-001b-14 (pelanggaran hooks) | Keduanya butuh keadaan yang tidak masuk akal diotomasi; hasilnya ditempel di catatan Coder |

**Data uji / fixture:** seed sistem (`Default Company` + admin dari `.env.test`).
E2E tidak membuat user tambahan.

**Isolasi:** `oddo_test` + Redis index `/1` untuk Jest **dan** Playwright
(`ADR-0005` §4). `pnpm test` dan `pnpm test:e2e` **tidak boleh** dijalankan bersamaan —
keduanya memakai database yang sama dan Jest mem-`TRUNCATE` di awal tiap file.

---

## 16. Definition of Done

- [ ] Semua AC di bagian 14 lulus
- [ ] Test unit + integration + E2E ditulis dan hijau
- [ ] Permission & record rule — **tidak berlaku di PRD ini**, tetap PRD-002
- [ ] Audit log — **tidak berlaku**; logging §12.1 diperluas satu kejadian
- [ ] Error state & validasi sesuai bagian 10 dan 11
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` bersih
- [ ] Tidak ada file env keempat (`ADR-0005` §1)
- [ ] `CLAUDE.md` tabel "Perintah penting" memuat `pnpm test:e2e`
- [ ] `README.md` memuat cara menjalankan E2E + peringatan jangan bersamaan dengan `pnpm test`
- [ ] `PRODUCT-SCOPE` §4.1 butir 5–6 dan §4.2 butir 7 semuanya selesai
- [ ] `docs/prd/README.md` diperbarui
- [ ] Bagian catatan Coder di bawah diisi

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

**Bukti Acceptance Criteria:**

**Deviasi dari PRD (kalau ada) + alasannya:**

**Hal yang perlu diputuskan Mentor untuk PRD berikutnya:**

**Cara menjalankan & menguji:**
