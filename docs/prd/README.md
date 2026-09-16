# Papan Status PRD — Oddo ERP

> **Ini sumber kebenaran progres project.** Status di sini wajib sinkron dengan
> frontmatter `status:` di masing-masing file PRD. Kalau berbeda, yang salah adalah
> yang belum di-update — perbaiki keduanya.

## Arti status

| Status | Artinya | Siapa yang pegang bola |
|---|---|---|
| `draft` | Mentor masih menyusun, belum boleh dikerjakan | Mentor |
| `ready` | Lengkap & tidak ambigu, siap dieksekusi | Coder |
| `in-progress` | Sedang dikerjakan sesi Coder | Coder |
| `review` | Kode selesai, menunggu verifikasi Mentor terhadap Acceptance Criteria | Mentor |
| `done` | Semua AC terpenuhi dan diverifikasi | — |
| `blocked` | Coder menemukan ambiguitas, ada Open Question yang belum dijawab | Mentor |

## Arti prioritas

`P0` core/blocking · `P1` MVP · `P2` V1 · `P3` V2 · `P4` Future

---

## Daftar PRD

| ID | Judul | Modul | Prioritas | Depends on | Status | Terakhir diubah |
|---|---|---|---|---|---|---|
| [PRD-000](PRD-000-project-scaffolding.md) | Project scaffolding | infra | P0 | — | `done` | 2026-09-16 |
| [PRD-001a](PRD-001a-auth-login.md) | Auth: bisa login | core/auth | P0 | PRD-000 | `done` | 2026-09-16 |
| [PRD-001b](PRD-001b-auth-enforcement.md) | Auth: tidak bisa dilewati | core/auth | P0 | PRD-001a | `ready` | 2026-09-16 |

### Rencana PRD berikutnya (belum ditulis)

Urutan dan cakupannya ada di [`docs/PRODUCT-SCOPE.md`](../PRODUCT-SCOPE.md) bagian 4.

> **Bawaan wajib dari review PRD-000** — enam baris In Scope (butir 1–4 → PRD-001a,
> butir 5–6 → PRD-001b) dan satu acceptance criteria untuk PRD-002 sudah ditetapkan di
> [`PRODUCT-SCOPE` §4.1](../PRODUCT-SCOPE.md#41-bawaan-wajib-dari-review-prd-000-2026-09-16).
> PRD-001a dan PRD-001b sudah memuatnya. **PRD-002 belum ditulis dan tidak boleh ditulis
> tanpa memuat acceptance criteria zona lint antar-modul** di
> [`PRODUCT-SCOPE` §4.1](../PRODUCT-SCOPE.md#41-bawaan-wajib-dari-review-prd-000-2026-09-16).

| ID | Judul | Depends on |
|---|---|---|
| PRD-002 | Company, User, Role & Permission | 001b |
| PRD-003 | Sequence, Currency, Tax | 002 |
| PRD-004 | Partner (customer & vendor) | 002 |
| PRD-005 | UoM, Product Category, Product | 002 |
| PRD-006 | Inventory: warehouse, location, quant | 005 |
| PRD-007 | Inventory: stock move & adjustment | 006 |
| PRD-008 | Sales: quotation → sales order | 003, 004, 005 |
| PRD-009 | Delivery: reservasi → stock move | 007, 008 |

---

## Daftar ADR

| ID | Judul | Status | Tanggal |
|---|---|---|---|
| [ADR-0001](../adr/ADR-0001-tech-stack.md) | Tech stack | `accepted` | 2026-09-16 |
| [ADR-0002](../adr/ADR-0002-arsitektur-inti.md) | Arsitektur inti — modul, multi-company, hak akses, audit | `accepted` | 2026-09-16 |
| [ADR-0003](../adr/ADR-0003-model-pencatatan-stok.md) | Pencatatan stok double-entry dengan lokasi virtual | `accepted` | 2026-09-16 |
| [ADR-0004](../adr/ADR-0004-composition-root-aplikasi.md) | Composition root — `configureApp` untuk production & test, dua kanal pendaftaran guard | `accepted` | 2026-09-16 |
| [ADR-0005](../adr/ADR-0005-konfigurasi-environment-dan-lingkungan-test.md) | Konfigurasi environment, logging, dan lingkungan test | `accepted` | 2026-09-16 |

---

## Fase Fondasi

| # | Item | Output | Status |
|---|---|---|---|
| F1 | Ruang lingkup produk & modul MVP | [`docs/PRODUCT-SCOPE.md`](../PRODUCT-SCOPE.md) | ✅ selesai |
| F2 | Tech stack | [`ADR-0001`](../adr/ADR-0001-tech-stack.md) | ✅ selesai |
| F3 | Arsitektur inti | [`ADR-0002`](../adr/ADR-0002-arsitektur-inti.md) + [`ADR-0003`](../adr/ADR-0003-model-pencatatan-stok.md) | ✅ selesai |
| F4 | Data model fondasi | PRD-001a `done`, lanjut PRD-001b & PRD-002 | 🚧 berjalan — `user` + `company` sudah ada per 2026-09-16 |

---

## Keputusan yang masih terbuka

`DECISION REQUIRED` — sesi Coder **tidak boleh menebak** salah satu dari ini.
Daftar lengkap ada di [`docs/PRODUCT-SCOPE.md`](../PRODUCT-SCOPE.md) bagian 6.

| # | Pertanyaan | Harus dijawab sebelum |
|---|---|---|
| Q-01 | Stok boleh minus atau tidak? | PRD-007 |
| Q-02 | Costing method: FIFO / average / standard? | V1 |
| Q-03 | Tarif PPN default & apakah satu produk bisa punya >1 pajak? | PRD-003 |
| Q-04 | Format nomor dokumen final | PRD-003 |
| Q-05 | SO boleh di-cancel setelah sebagian dikirim? | PRD-009 |
| Q-06 | Satu SO boleh menghasilkan berapa Delivery Order? | PRD-009 |
| Q-07 | Dokumen dihapus permanen atau di-archive? | PRD-002 |
| Q-08 | Berapa lama audit log disimpan? | V1 |
| Q-09 | Reservasi otomatis atau manual? | PRD-009 |

---

## Catatan alur kerja

```
/mentor  →  tulis PRD (status: ready)  →  update tabel di atas
                       ↓
/coder PRD-00X  →  implementasi + test  →  status: review + isi "Catatan Coder"
                       ↓
/mentor  →  verifikasi AC  →  status: done  →  PRD berikutnya
```

Coder **tidak menebak**. Ambiguitas → tulis di `## Open Questions`, set `status: blocked`.
