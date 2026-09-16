# Oddo — ERP Web App

Membangun aplikasi web ERP bergaya **Odoo**: satu platform dengan banyak modul bisnis
(CRM, Sales, Inventory, Purchase, Accounting, HR, dst.) yang saling terhubung di atas
data model dan sistem hak akses yang sama.

> **Brief induk: `first-step.md`** — ditulis oleh owner project, berisi target-state,
> cakupan modul, prinsip arsitektur, stack, dan aturan kerja. Dokumen apa pun yang
> bertentangan dengannya kalah, kecuali owner memutuskan lain secara eksplisit.
>
> Status project: **PHASE 1 — Discovery SELESAI (2026-09-16)**. Fase Fondasi F1–F3 beres;
> hasilnya di `docs/PRODUCT-SCOPE.md` dan `docs/adr/`.
> Sesi Coder hanya boleh menulis kode untuk PRD yang berstatus `ready` di
> `docs/prd/README.md`. Di luar itu, JANGAN menulis kode aplikasi.

---

## Cara kerja: 2 sesi Claude Code

Project ini dikerjakan oleh dua sesi terpisah yang **tidak bisa saling berkirim pesan**.
Satu-satunya jembatan antar sesi adalah **file di dalam repo ini**.

| Sesi | Command | Tugas | Boleh menulis ke |
|---|---|---|---|
| **Mentor** | `/mentor` | Menjelaskan konsep, mengambil keputusan arsitektur, menulis PRD & ADR | `docs/**`, `CLAUDE.md`, `.claude/**` |
| **Coder** | `/coder` | Mengeksekusi PRD menjadi kode + test | kode aplikasi, test, `## Catatan Coder` di PRD |

Alur normal:

```
/mentor  →  tulis docs/prd/PRD-00X-*.md  (status: ready)
                        │
                        ▼
/coder PRD-00X  →  implementasi + test  →  status: review + isi "Catatan Coder"
                        │
                        ▼
/mentor  →  review hasil, jawab Open Questions  →  status: done  →  PRD berikutnya
```

Kalau Coder menemukan PRD yang ambigu: **tidak menebak**. Tulis pertanyaan di bagian
`## Open Questions`, set `status: blocked`, lalu Mentor yang menjawab.

---

## Peta direktori

```
CLAUDE.md                  ← file ini (konteks bersama kedua sesi)
.claude/commands/
  mentor.md                ← prompt sesi Mentor
  coder.md                 ← prompt sesi Coder
docs/
  PRODUCT-SCOPE.md         ← ruang lingkup + 12 keputusan FROZEN + roadmap PRD
  prd/
    README.md              ← PAPAN STATUS semua PRD (sumber kebenaran progres)
    _TEMPLATE.md           ← template PRD
    PRD-000-*.md           ← satu file = satu unit kerja
  adr/
    _TEMPLATE.md           ← template Architecture Decision Record
    ADR-0001-*.md          ← keputusan teknis yang mengikat kedua sesi
  learning/                ← catatan penjelasan dari Mentor (materi belajar)
```

**Urutan baca untuk sesi mana pun:** `CLAUDE.md` → `docs/PRODUCT-SCOPE.md` →
seluruh `docs/adr/*.md` → `docs/prd/README.md` → PRD yang sedang dikerjakan.

## Konvensi

- **Penamaan PRD**: `PRD-<3 digit>-<slug-kebab-case>.md`, contoh `PRD-004-inventory-stock-move.md`.
- **Penamaan ADR**: `ADR-<4 digit>-<slug-kebab-case>.md`.
- **Status PRD**: `draft` → `ready` → `in-progress` → `review` → `done`; plus `blocked`.
  Status ditulis di frontmatter PRD **dan** di `docs/prd/README.md` — keduanya harus sinkron.
- **Bahasa**: dokumen & penjelasan dalam Bahasa Indonesia, istilah teknis tetap Inggris.
  Kode, nama variabel, commit message, dan komentar kode dalam Bahasa Inggris.
- **Satu PRD = satu sesi coder.** Kalau perkiraan kerja > 1 hari, Mentor wajib memecahnya.

## Stack

Ditetapkan owner di `first-step.md` §16. **Jangan diubah tanpa persetujuan eksplisit owner**;
kalau ada alasan kuat, ajukan sebagai ADR + trade-off, jangan diputuskan sepihak.

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
| Arsitektur | **Modular Monolith** (bukan microservices), disiapkan agar modul bisa dipisah nanti |

Pilihan turunan yang **tidak** disebut owner (package manager, id, tipe uang, format error,
auth, test runner, migrasi) diputuskan di `docs/adr/ADR-0001-tech-stack.md` — itu yang mengikat.

| Turunan | Keputusan | Rujukan |
|---|---|---|
| Package manager & repo | pnpm workspace: `apps/api`, `apps/web`, `packages/shared`, `packages/config` | ADR-0001 B1 |
| Auth | Session di Redis + httpOnly cookie, password argon2id | ADR-0001 B2 |
| Primary key | UUID v7, dibangkitkan di application layer | ADR-0001 B3 |
| Uang & kuantitas | `Decimal` / `NUMERIC`. **Tidak pernah** `float` | ADR-0001 B4 |
| Waktu | `TIMESTAMPTZ` UTC, tampil Asia/Jakarta | ADR-0001 B5 |
| Test | Jest di `apps/api`, Vitest di `apps/web`, integration pakai Postgres nyata | ADR-0001 B7 |

Prinsip yang mengikat semua PRD: target-state boleh besar, tapi eksekusi bertahap
(MVP → V1 → V2 → Future); jangan over-engineering; modul ERP harus terintegrasi
(Sales → Delivery → Inventory → Invoice → Accounting → Payment), bukan aplikasi terpisah.

## Aturan yang tidak boleh dilanggar PRD mana pun

Rincian dan alasannya ada di `docs/adr/ADR-0002-arsitektur-inti.md`.

1. Tidak ada query ke tabel bisnis tanpa `companyId`.
2. Tidak ada endpoint tanpa `@RequirePermission` atau `@Public()`.
3. Tidak ada transisi state di luar transaksi database.
4. Tidak ada `DELETE` fisik pada dokumen yang pernah punya nomor final — pakai `active = false`.
5. Tidak ada modul yang menulis ke tabel milik modul lain.
6. Tidak ada `number`/`float` untuk uang atau kuantitas.
7. Tidak ada perubahan skema tanpa file migrasi yang di-commit.
8. Tidak ada stok yang berubah di luar `stock_move` (lihat `ADR-0003`).

## Perintah penting

Diisi oleh sesi Coder saat **PRD-000** selesai. Semua perintah dijalankan dari root repo.
Package manager: **pnpm 9.15.4** lewat corepack (lihat `README.md` §1 kalau `corepack enable`
gagal EPERM di Windows).

| Keperluan | Perintah |
|---|---|
| Install | `pnpm install` |
| Siapkan env | salin `.env.example` → `.env` |
| Nyalakan DB & Redis | `pnpm docker:up` (menunggu healthcheck hijau) |
| Matikan | `pnpm docker:down` · hapus volume: `pnpm docker:reset` |
| Dev server | `pnpm dev` (api :3001, web :3000) |
| Build | `pnpm build` |
| Test | `pnpm test` (butuh Docker jalan; memakai database `oddo_test`) |
| Lint | `pnpm lint` (`--max-warnings=0`) |
| Typecheck | `pnpm typecheck` |
| Format | `pnpm format` / `pnpm format:check` |
| Migrasi | `pnpm db:migrate` |
| Seed | `pnpm db:seed` |
| Prisma Studio | `pnpm db:studio` |
| Reset DB dev | `pnpm db:reset` (menghapus isi `oddo_dev`, lalu migrasi + seed ulang) |

Filter per package memakai nama lengkap yang ber-scope, mis.
`pnpm --filter @oddo/api test` — `--filter api` tidak akan cocok.
