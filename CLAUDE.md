# Oddo — ERP Web App

Membangun aplikasi web ERP bergaya **Odoo**: satu platform dengan banyak modul bisnis
(CRM, Sales, Inventory, Purchase, Accounting, HR, dst.) yang saling terhubung di atas
data model dan sistem hak akses yang sama.

> **Brief induk: `perintah-awal.md`** — ditulis oleh owner project, berisi target-state,
> cakupan modul, prinsip arsitektur, stack, dan aturan kerja. Dokumen apa pun yang
> bertentangan dengannya kalah, kecuali owner memutuskan lain secara eksplisit.
>
> Status project: **fase perancangan (PHASE 1 — Discovery)**.
> Selama belum ada PRD/work package berstatus siap, JANGAN menulis kode aplikasi.

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
  prd/
    README.md              ← PAPAN STATUS semua PRD (sumber kebenaran progres)
    _TEMPLATE.md           ← template PRD
    PRD-001-*.md           ← satu file = satu unit kerja
  adr/
    _TEMPLATE.md           ← template Architecture Decision Record
    ADR-0001-*.md          ← keputusan teknis yang mengikat kedua sesi
  learning/                ← catatan penjelasan dari Mentor (materi belajar)
```

## Konvensi

- **Penamaan PRD**: `PRD-<3 digit>-<slug-kebab-case>.md`, contoh `PRD-004-inventory-stock-move.md`.
- **Penamaan ADR**: `ADR-<4 digit>-<slug-kebab-case>.md`.
- **Status PRD**: `draft` → `ready` → `in-progress` → `review` → `done`; plus `blocked`.
  Status ditulis di frontmatter PRD **dan** di `docs/prd/README.md` — keduanya harus sinkron.
- **Bahasa**: dokumen & penjelasan dalam Bahasa Indonesia, istilah teknis tetap Inggris.
  Kode, nama variabel, commit message, dan komentar kode dalam Bahasa Inggris.
- **Satu PRD = satu sesi coder.** Kalau perkiraan kerja > 1 hari, Mentor wajib memecahnya.

## Stack

Ditetapkan owner di `perintah-awal.md` §16. **Jangan diubah tanpa persetujuan eksplisit owner**;
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

Prinsip yang mengikat semua PRD: target-state boleh besar, tapi eksekusi bertahap
(MVP → V1 → V2 → Future); jangan over-engineering; modul ERP harus terintegrasi
(Sales → Delivery → Inventory → Invoice → Accounting → Payment), bukan aplikasi terpisah.

## Perintah penting

Diisi setelah project di-scaffold (install, dev server, test, lint, migrasi).

- Install: _TBD_
- Dev: _TBD_
- Test: _TBD_
- Lint: _TBD_
