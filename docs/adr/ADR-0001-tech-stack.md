---
id: ADR-0001
title: Tech stack Oddo ERP — meratifikasi pilihan owner dan mengisi yang belum ditentukan
status: accepted
date: 2026-09-16
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-0001 — Tech Stack

## Konteks

Owner sudah menetapkan stack inti di `first-step.md` §16. Bagian itu **tidak dibuka
lagi untuk diperdebatkan** — ADR ini meratifikasinya.

Tapi §16 hanya menyebut nama teknologi, bukan cara memakainya. Ada belasan pilihan
turunan yang kalau tidak diputuskan sekarang akan diputuskan diam-diam oleh sesi Coder,
lalu berbeda-beda antar PRD: package manager apa, bagaimana uang disimpan, id pakai apa,
error API bentuknya bagaimana. Itu yang diputuskan di sini.

---

## Bagian A — Ditetapkan owner (final)

| Lapis | Pilihan |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| API | REST + OpenAPI |
| Cache / queue | Redis |
| Object storage | S3-compatible |
| Infra | Docker |
| Testing | Unit + Integration + E2E |
| Arsitektur | Modular Monolith |

Kalau suatu saat ada alasan kuat untuk mengubah salah satunya: ajukan ADR baru berisi
trade-off, jangan diputuskan sepihak.

---

## Bagian B — Yang belum ditentukan, diputuskan di sini

### B1. Package manager & bentuk repo → **pnpm workspace**

**Opsi yang dipertimbangkan:**

| Opsi | Untung | Rugi |
|---|---|---|
| **pnpm workspace (dipilih)** | Tipe DTO ditulis sekali di `packages/shared`, dipakai backend & frontend — tidak mungkin beda diam-diam. Disk hemat karena symlink. Ketat soal dependency hantu | Harus paham konsep workspace |
| npm/yarn workspace | Lebih umum ditemui | npm lebih lambat, dan longgar terhadap dependency yang tidak dideklarasikan |
| Dua repo terpisah | Paling sederhana dipahami | Tipe request/response ditulis dua kali dan pasti tidak sinkron |
| + Turborepo/Nx | Cache build, orkestrasi task | Belum ada yang lambat. Menambah konsep tanpa manfaat nyata sekarang |

**Struktur:**

```
oddoProject/
├── apps/
│   ├── api/          NestJS
│   └── web/          Next.js
├── packages/
│   ├── shared/       tipe, enum, konstanta, util murni yang dipakai keduanya
│   └── config/       konfigurasi ESLint + TS base yang di-extend
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json      script orkestrasi tingkat root
```

`packages/shared` **tidak boleh** mengimpor apa pun dari `apps/`. Arah dependency selalu
`apps → packages`, tidak pernah sebaliknya.

### B2. Authentication → **session di Redis + httpOnly cookie**

| Opsi | Untung | Rugi |
|---|---|---|
| **Session + Redis (dipilih)** | Pencabutan akses berlaku seketika — syarat audit ERP. Daftar sesi aktif bisa ditampilkan. Token tak terjangkau JavaScript | Satu lookup Redis per request |
| JWT stateless | Tanpa lookup | Mencabut akses sebelum kedaluwarsa butuh blacklist di Redis — keuntungan stateless-nya hilang |
| Auth.js / Better Auth | Hemat waktu, jalan ke SSO terbuka | Berpusat di Next.js, sementara sumber kebenaran kita di NestJS |

**Detail yang mengikat:**

- Password di-hash **argon2id** (bukan bcrypt, bukan SHA apa pun)
- Session id: 256 bit acak dari CSPRNG, disimpan di Redis dengan TTL
- Cookie: `httpOnly`, `SameSite=Lax`, `Secure` di production, `path=/`
- Sliding expiration: TTL diperpanjang saat ada aktivitas, dengan batas absolut
- Logout menghapus session di Redis, bukan hanya cookie di browser

### B3. Identitas baris (primary key) → **UUID v7**

| Opsi | Untung | Rugi |
|---|---|---|
| **UUID v7 (dipilih)** | Urut secara waktu → index B-tree tidak terfragmentasi seperti UUID v4. Tidak membocorkan jumlah data. Id bisa dibuat sebelum insert | 16 byte, lebih besar dari bigint |
| bigint auto-increment | Terkecil, tercepat | `/orders/1042` membocorkan volume bisnis. Menggabungkan data antar-instance jadi sulit |
| UUID v4 | Acak sempurna | Insert acak membuat index terfragmentasi; terasa setelah ratusan ribu baris |
| cuid2 | Ramah URL | Ekosistem lebih kecil, bukan tipe native Postgres |

Dibangkitkan di **application layer** (package `uuid` v10+, fungsi `v7()`), bukan oleh
database. Alasannya: id sudah tersedia sebelum `INSERT`, jadi objek turunan bisa dirakit
dalam satu transaksi tanpa round-trip.

### B4. Uang & angka → **`Decimal`, tidak pernah `float`**

Ini aturan keras, bukan preferensi.

| Aspek | Ketentuan |
|---|---|
| Tipe kolom uang | `NUMERIC(18, 4)` di Postgres → `Decimal` di Prisma |
| Tipe kolom kuantitas | `NUMERIC(18, 6)` — konversi UoM menghasilkan pecahan |
| Di TypeScript | `Prisma.Decimal`, atau string saat lewat JSON API |
| Dilarang | `number` / `float` / `double` untuk uang atau qty |
| Pembulatan | Dibulatkan **hanya saat menyimpan total dokumen**, pakai *half-up*. Perhitungan antara tidak dibulatkan |

Alasannya: `0.1 + 0.2 !== 0.3` di floating point. Di aplikasi biasa itu kosmetik;
di ERP itu berarti neraca tidak balance dan stok tidak bisa direkonsiliasi.

### B5. Waktu & timezone → **simpan UTC, tampilkan Asia/Jakarta**

- Semua kolom waktu: `TIMESTAMPTZ`, disimpan UTC
- Konversi ke zona waktu user terjadi di lapis presentasi, bukan di database
- Tanggal dokumen (tanggal SO, tanggal invoice) adalah `DATE` polos tanpa jam —
  tanggal 16 September tetap 16 September di zona waktu mana pun

### B6. Validasi input → **`class-validator` + `ValidationPipe` global**

Dipilih karena ini jalur bawaan NestJS: DTO dengan decorator sekaligus jadi sumber
skema OpenAPI lewat `@nestjs/swagger`. Alternatifnya `zod` (lebih baik inferensi tipenya)
ditolak karena butuh jembatan tambahan ke Swagger dan ke sistem DI NestJS.

`ValidationPipe` dipasang global dengan `whitelist: true` dan
`forbidNonWhitelisted: true` — field yang tidak dideklarasikan di DTO **ditolak**,
bukan diabaikan diam-diam.

Pengecualian: validasi **environment variable** saat boot pakai `zod`, karena itu
di luar sistem DI dan harus gagal keras sebelum aplikasi menerima request.

### B7. Test runner → **Jest di `apps/api`, Vitest di `apps/web`**

Dua runner berbeda itu disengaja: masing-masing adalah pilihan bawaan ekosistemnya.
NestJS + Jest bekerja tanpa konfigurasi tambahan untuk decorator metadata; Vitest di
NestJS butuh `unplugin-swc` dan konfigurasi ekstra. Sebaliknya Vitest jauh lebih ramah
untuk Next.js. Menyamakan keduanya berarti menambah friksi di salah satu sisi tanpa
imbalan.

| Level | Alat | Yang diuji |
|---|---|---|
| Unit | Jest / Vitest | Business rule murni, kalkulasi, state machine — tanpa DB |
| Integration | Jest + Supertest + Postgres nyata (Docker) | Endpoint → service → DB, termasuk permission & record rule |
| E2E | Playwright | Alur user di browser |

Integration test memakai **database Postgres sungguhan**, bukan mock dan bukan SQLite.
Alasannya: yang paling sering salah di ERP justru hal yang tidak ada di SQLite —
transaksi, constraint, dan locking.

### B8. Bentuk error API → **satu format untuk semua endpoint**

```json
{
  "statusCode": 409,
  "code": "STATE_CONFLICT",
  "message": "Sales Order sudah dikonfirmasi dan tidak bisa diubah",
  "details": [
    { "field": "state", "issue": "expected draft, found confirmed" }
  ],
  "requestId": "01J8X...",
  "timestamp": "2026-09-16T04:12:33.120Z"
}
```

- `code` adalah **enum stabil** yang boleh dipakai frontend untuk bercabang.
  `message` untuk dibaca manusia dan boleh berubah kapan saja.
- Dihasilkan oleh satu exception filter global. Tidak ada controller yang merakit
  bentuk error sendiri.
- `requestId` masuk ke setiap baris log, supaya keluhan user bisa dilacak ke log.

### B9. Logging → **pino**, terstruktur, JSON

Setiap baris log wajib membawa `requestId`, `userId`, `companyId` bila ada.
Yang **dilarang masuk log**: password, session id, isi cookie, token apa pun.

### B10. Migrasi database → **Prisma Migrate**, migrasi selalu di-commit

- Perubahan skema selalu lewat file migrasi yang masuk repo. Tidak ada `db push`
  di lingkungan mana pun selain eksperimen lokal yang dibuang.
- Satu PRD boleh menghasilkan lebih dari satu migrasi, tapi migrasi tidak pernah
  diedit setelah di-commit — perbaikan ditulis sebagai migrasi baru.
- Seed data dipisah: `seed/system` (lokasi virtual, permission, currency IDR — wajib ada
  di lingkungan mana pun) vs `seed/demo` (data contoh untuk development saja).

---

## Konsekuensi

**Positif**
- Semua PRD berikutnya tinggal merujuk ADR ini untuk hal-hal yang berulang; PRD bisa
  fokus ke business logic.
- Sesi Coder punya jawaban untuk pertanyaan yang biasanya dijawab dengan selera.
- Keputusan uang/waktu/id diambil sebelum ada satu baris data pun — bagian termahal
  untuk diubah belakangan.

**Harga yang dibayar**
- Aturan `Decimal` membuat kode kalkulasi lebih bertele-tele daripada aritmetika biasa.
- Session di Redis berarti Redis jadi dependency wajib, bahkan untuk development.
- Dua test runner berarti dua konfigurasi yang harus dipelihara.

**Yang jadi wajib mulai sekarang**
1. Tidak ada `number` untuk uang atau kuantitas — di mana pun, termasuk DTO dan UI.
2. Tidak ada `Date` tanpa timezone di database.
3. Tidak ada error response yang dirakit manual di controller.
4. Tidak ada perubahan skema tanpa file migrasi yang di-commit.
5. Tidak ada rahasia yang di-hardcode — semua lewat env var yang divalidasi saat boot.

---

## Cara mengecek kepatuhan

| Aturan | Cara mengecek |
|---|---|
| Tidak ada float untuk uang | Review skema Prisma: setiap kolom uang wajib `Decimal @db.Decimal(18,4)` |
| Format error seragam | Integration test yang memicu 400/403/404/409 dan mencocokkan bentuk JSON-nya |
| Env tervalidasi | Test yang menjalankan boot tanpa env wajib dan memastikan proses gagal |
| Arah dependency workspace | ESLint rule `import/no-restricted-paths` di `packages/config` |
| Password tidak bocor ke log | Test pada serializer log |

---

## Kapan ADR ini perlu ditinjau ulang

- Kalau build monorepo sudah di atas ~2 menit → pertimbangkan Turborepo (B1).
- Kalau muncul kebutuhan SSO/Google Login → tinjau B2, tapi session tetap bisa
  dipertahankan dengan OIDC di depannya.
- Kalau jumlah baris di satu tabel transaksi melewati ~50 juta → tinjau B3.
