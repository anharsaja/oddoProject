# PRODUCT SCOPE — Oddo ERP

```
Status   : APPROVED
Tanggal  : 2026-09-16
Disetujui: owner (via Discovery batch 1–3)
```

> Dokumen ini adalah hasil **PHASE 1 — Discovery**. Keputusan di bagian 2 berstatus
> **FROZEN**: tidak diubah tanpa persetujuan eksplisit owner. Kalau ada PRD atau ADR
> yang bertentangan dengan dokumen ini, yang salah adalah PRD/ADR-nya.

---

## 1. Apa yang dibangun

**Aplikasi ERP internal** — satu platform, banyak modul bisnis yang saling terhubung
di atas data model dan sistem hak akses yang sama.

**Bukan** marketing website mirip odoo.com. **Bukan** juga platform dengan app store
internal yang bisa pasang/lepas modul saat runtime — modularitas kita adalah modularitas
*kode* (folder per modul, batas dependency yang tegas), bukan modularitas *runtime*.

**Tujuan berlapis:**

1. training project & pembelajaran arsitektur software
2. prototype yang bisa dikembangkan untuk perusahaan
3. fondasi ERP internal jangka panjang

**Domain model pertama: trading / distribusi.** Beli barang jadi → simpan di gudang →
jual lagi. Punya produk fisik, stok, gudang, customer, dan vendor.

---

## 2. Keputusan yang dibekukan

| # | Topik | Keputusan | Konsekuensi yang mengikat semua PRD |
|---|---|---|---|
| D-01 | Domain | Trading / distribusi | Produk fisik + gudang jadi warga kelas satu |
| D-02 | Urutan MVP | Core → Inventory → Sales | Purchase ditunda ke V1; stok awal via Inventory Adjustment |
| D-03 | Multi-company | Ready, UI single | `company_id NOT NULL` di semua tabel bisnis + record rule sejak PRD-001. Tanpa company switcher |
| D-04 | Permission | RBAC string + record rule company | Format `modul.objek.aksi`. Role = kumpulan permission. Guard cek permission **dan** company |
| D-05 | Model stok | Double-entry + lokasi | Setiap stock move punya location asal & tujuan, termasuk lokasi virtual. Lihat `ADR-0003` |
| D-06 | Model produk | Sederhana + multi-UoM | `type` (stockable/consumable/service), kategori, konversi UoM dalam satu kategori. **Tanpa** lot/serial, **tanpa** varian |
| D-07 | Currency | IDR saja, struktur currency-ready | Tabel `currency` + `exchange_rate` ada; dokumen simpan `currency_id` + `rate`. Sekarang selalu IDR rate 1. UI tidak menampilkan pilihan |
| D-08 | Pajak | Masuk MVP, tax-exclusive | Harga satuan belum termasuk PPN. Tarif disimpan sebagai data, bukan angka hardcoded |
| D-09 | PRD pertama | PRD-000 scaffolding terpisah | Nol business logic di PRD-000 |
| D-10 | Repo | pnpm workspace sederhana | `apps/api`, `apps/web`, `packages/shared`. Tanpa Nx/Turborepo |
| D-11 | Auth | Session di Redis + httpOnly cookie | Password argon2id. Pencabutan akses berlaku seketika |
| D-12 | Struktur org | Company + Warehouse saja | Branch, Department, Job Position, Employee ditunda ke modul HR (V1/V2) |

---

## 3. Peta modul per tahap

### MVP — P0 & P1

| Modul | Cakupan | Sengaja tidak termasuk |
|---|---|---|
| **Core — Platform** | Auth & session, User, Company, Role & Permission, Audit Log, Sequence, System Settings | Notification, Attachment, Automation, SSO |
| **Core — Master data** | Partner (customer + vendor dalam satu tabel), Product, Product Category, UoM + konversi, Tax, Currency (IDR) | Price list, Payment term, Varian produk |
| **Inventory** | Warehouse, Location (termasuk virtual), Stock Move, Stock Quant (on-hand), Opening stock via Adjustment, Internal transfer | Lot/serial, expiry, valuation & costing, reorder rule, multi-step routing |
| **Sales** | Quotation → Sales Order, order line, diskon, pajak, Delivery Order + reservasi stok | Invoice, Payment, Return, Price list, approval berjenjang |

### V1 — P2

Purchase (RFQ → PO → Receipt → Vendor Bill) · Accounting dasar (Chart of Accounts,
Journal Entry, Customer Invoice, Payment, AR/AP) · Inventory valuation & costing method ·
Sales Return & Credit Note · CRM (Lead, Opportunity, Pipeline) · Reporting operasional ·
Import/Export CSV · Notification in-app · Attachment

### V2 — P3

Multi-company penuh (switcher, data sharing, konsolidasi) · Multi-currency aktif +
selisih kurs · Lot/batch, serial number, expiry (FEFO) · Varian produk · HR (Employee,
Attendance, Leave, Expense) · Project & Timesheet · Approval workflow berjenjang ·
Price list & payment term · Dashboard analitik

### Future — P4

Manufacturing (BoM, MO, Work Center, Scrap) · POS · Payment gateway · E-commerce ·
Integrasi perbankan · Integrasi pajak/pemerintah *(REGULATORY VALIDATION REQUIRED)* ·
Webhook & public API · Automation engine (trigger → condition → action) ·
Document management dengan versioning

---

## 4. Roadmap PRD menuju MVP

Setiap PRD adalah **vertical slice** (backend + UI secukupnya), dipersempit supaya
muat satu sesi Coder. Alasannya ada di `ADR-0002` bagian "Batas satu PRD".

| PRD | Judul | Prioritas | Depends on | Inti yang harus jadi |
|---|---|---|---|---|
| PRD-000 | Project scaffolding | P0 | — | Monorepo, Docker, Prisma, health check, test runner hijau |
| PRD-001a | Auth: bisa login | P0 | 000 | Company minimal + user, argon2id, session Redis (sliding + batas absolut), `/auth/login`, `/auth/logout`, `/auth/me`, halaman `/login` |
| PRD-001b | Auth: tidak bisa dilewati | P0 | 001a | `AuthGuard` global lewat `APP_GUARD`, penegakan `@Public()`, proteksi route di web, health pindah ke `/health`, shell + logout, Playwright E2E |
| PRD-002 | Company, User, Role & Permission | P0 | 001b | RBAC, record rule company, audit log, layar Settings |
| PRD-003 | Sequence, Currency, Tax | P0 | 002 | Penomoran dokumen aman dari race, tabel pajak & currency |
| PRD-004 | Partner (customer & vendor) | P1 | 002 | Master partner + alamat + kontak, list & form |
| PRD-005 | UoM, Product Category, Product | P1 | 002 | Produk + konversi UoM (dus ↔ pcs) |
| PRD-006 | Inventory: warehouse, location, quant | P1 | 005 | Struktur gudang + lokasi virtual + on-hand |
| PRD-007 | Inventory: stock move & adjustment | P1 | 006 | Double-entry move + opening stock + internal transfer |
| PRD-008 | Sales: quotation → sales order | P1 | 004, 005, 003 | Dokumen penjualan lengkap dengan diskon & pajak |
| PRD-009 | Delivery: reservasi → stock move | P1 | 007, 008 | Sambungan Sales ↔ Inventory. **Ini puncak MVP** |

Urutan ini boleh bergeser kalau ada temuan saat implementasi, tapi **dependency-nya tidak boleh dilanggar**.

### 4.1 Bawaan wajib dari review PRD-000 (2026-09-16)

Baris di bawah ini **bukan saran dan bukan catatan**. Statusnya sama dengan isi PRD:
PRD yang disebut wajib memuatnya, dan PRD itu tidak boleh berstatus `done` selama
salah satunya belum dikerjakan. Sumbernya ada di bagian "Review Mentor" di
[`PRD-000`](prd/PRD-000-project-scaffolding.md).

**Wajib masuk In Scope PRD-001a:**

| # | Yang harus dikerjakan | Asal |
|---|---|---|
| 1 | Pindahkan `ApiErrorResponse` dan `ApiErrorDetail` dari `apps/api/src/common/api-error.ts` ke `packages/shared`, lalu web mengimpornya dari `@oddo/shared`. `apps/api` tidak boleh lagi mendeklarasikan bentuk error sendiri | Deviasi D-5 · amandemen `ADR-0001` B8 |
| 2 | Ubah `LOG_LEVEL` di `.env.test` dari `debug` jadi `warn` | `ADR-0005` §4 |
| 3 | Tambahkan `@default(now())` pada `updatedAt` di `system_setting` beserta satu file migrasi baru — migrasi lama tidak diedit | Temuan F-1 · amandemen `ADR-0002` §4 |
| 4 | Satukan konstanta key `app.version`: sekarang dideklarasikan dua kali, di `apps/api/src/health/health.service.ts` dan `apps/api/prisma/seed/system.ts`. Jadikan satu deklarasi yang di-import keduanya | Temuan F-3 |
| 5 | Pasang plugin ESLint React & Next (`eslint-plugin-react-hooks`, `@next/eslint-plugin-next`) di `packages/config/eslint.base.mjs`, sebelum jumlah halaman bertambah | Pertanyaan Coder #6 |
| 6 | Playwright + satu E2E alur login sungguhan di browser | Pertanyaan Coder #7 · `ADR-0001` B7 |

PRD-001 **sudah diputuskan dipecah** (owner, 2026-09-16) jadi PRD-001a "bisa login" dan
PRD-001b "tidak bisa dilewati" — dipecah menurut nilai yang diantarkan, bukan menurut
layer, supaya keduanya tetap *vertical slice* seperti yang disyaratkan `ADR-0002` §6.
Butir 1–4 di atas masuk **001a**, butir 5–6 masuk **001b**.
**Status per review PRD-001a (2026-09-16): butir 1–4 ✅ selesai dan diverifikasi.
Butir 5–6 masih terbuka, menunggu PRD-001b.**

### 4.2 Bawaan wajib dari review PRD-001a (2026-09-16)

**Wajib masuk In Scope PRD-001b**, sebagai tambahan atas butir 5–6 di atas:

| # | Yang harus dikerjakan | Asal |
|---|---|---|
| 7 | Tutup **timing attack** pada login: email yang tidak terdaftar harus tetap melewati satu verifikasi argon2id terhadap hash dummy tetap, sehingga waktu responsnya sekelas dengan email yang terdaftar. Wajib punya acceptance criteria tersendiri yang mengukur selisih waktu, bukan sekadar menyebut kode dummy-nya ada | Pertanyaan Coder #1 pada PRD-001a |

Alasan butir 7 tidak ditunda ke V1 bersama rate limiting: BR-AUTH-002 di PRD-001a sudah
berjanji bahwa tiga jalur kegagalan login **tidak bisa dibedakan**. Janji itu ditepati
untuk *isi* respons tapi bocor lewat *waktu* respons — `~1 ms` untuk email asing versus
`~100 ms` untuk email terdaftar. Selama itu belum ditutup, halaman login tetap bisa
dipakai memetakan siapa saja yang punya akun di sini, dan aturan yang sudah kita tulis
sendiri tidak benar-benar berlaku. Rate limiting adalah kebijakan; ini perbaikan janji
yang sudah terlanjur dibuat.

**Wajib masuk PRD-002 sebagai acceptance criteria tersendiri**, ditulis persis seperti
ini supaya tidak melemah saat disalin:

```text
AC-002-XX  Batas antar-modul ditegakkan lint, bukan kesepakatan

Given: folder core/, inventory/, dan sales/ sudah ada di apps/api/src
When:  sebuah file di core/ menambahkan import dari inventory/ atau sales/,
       ATAU sebuah file di inventory/ menambahkan import dari sales/
Then:  `pnpm lint` gagal dengan pesan yang menyebut ADR-0002 §1,
       dan gagalnya terbukti — bukan hanya konfigurasi yang terpasang:
       PRD-002 wajib menunjukkan satu percobaan import terlarang yang
       membuat lint merah, lalu dihapus lagi
```

Zona `import/no-restricted-paths` yang aktif hari ini baru `packages/** ✗→ apps/**`.
Aturan modul `ADR-0002` §1 belum ditegakkan apa pun kecuali kedisiplinan — dan
kedisiplinan bukan mekanisme penegakan.

**Utang teknis yang sengaja ditunda** (bukan untuk MVP, tapi jangan sampai hilang):

| Utang | Pemicu untuk mengerjakannya |
|---|---|
| `package.json#prisma` deprecated, perlu pindah ke `prisma.config.ts` | Saat upgrade ke Prisma 7, atau saat warning-nya berubah jadi error |
| Halaman `/` masih halaman health PRD-000 | PRD-001b memindahkannya ke `/health` saat halaman login masuk |

---

## 5. Definisi MVP selesai

MVP dianggap selesai ketika skenario berikut bisa dijalankan dari awal sampai akhir
di aplikasi yang berjalan, tanpa menyentuh database secara manual:

```text
 1. Admin login, membuat company "PT Contoh" dan satu warehouse "WH Utama"
 2. Admin membuat dua user: Sales Staff dan Warehouse Staff, masing-masing dengan role
 3. Admin membuat produk "Kaos Polos": type stockable, UoM pcs,
    dengan konversi 1 dus = 24 pcs
 4. Warehouse Staff memasukkan stok awal 240 pcs lewat Inventory Adjustment
 5. Sales Staff membuat Quotation untuk customer, 2 baris, diskon, PPN
 6. Sales Staff menekan Confirm
       → nomor final terbit: SO/2026/0001
       → Delivery Order otomatis terbentuk
       → 240 pcs sebagian ter-reserve
       → audit log tercatat
 7. Warehouse Staff mem-validate Delivery Order
       → stock move WH/Stock → Customers tercatat
       → on-hand turun sesuai jumlah yang dikirim
 8. Sales Staff mencoba menghapus Sales Order → ditolak 403 (tidak punya permission)
 9. User dari company lain membuka daftar Sales Order → SO di atas TIDAK muncul
10. Admin membuka audit log → terlihat siapa yang confirm dan validate, kapan,
    dari state apa ke state apa
```

Langkah 8, 9, dan 10 sama wajibnya dengan langkah 1–7. Kalau hanya jalur suksesnya
yang jalan, MVP belum selesai.

---

## 6. Yang sengaja diparkir (belum diputuskan)

Ini bukan kelupaan — ini ditunda sampai PRD yang membutuhkannya ditulis.
Ditandai `DECISION REQUIRED` supaya tidak diputuskan diam-diam oleh sesi Coder.

| # | Pertanyaan | Harus dijawab sebelum |
|---|---|---|
| Q-01 | Stok boleh minus atau tidak? Per warehouse atau global? | PRD-007 |
| Q-02 | Costing method: FIFO / average / standard? | V1 (Inventory valuation) |
| Q-03 | Tarif PPN default berapa, dan apakah satu produk bisa punya lebih dari satu pajak? *(REGULATORY VALIDATION REQUIRED)* | PRD-003 |
| Q-04 | Format nomor dokumen final — `SO/2026/0001` atau ada kode cabang? | PRD-003 |
| Q-05 | Sales Order boleh di-cancel setelah sebagian dikirim? Apa yang terjadi pada stock move-nya? | PRD-009 |
| Q-06 | Partial delivery: satu SO boleh menghasilkan berapa Delivery Order? | PRD-009 |
| Q-07 | Apakah dokumen dihapus permanen atau di-*archive* saja? | PRD-002 |
| Q-08 | Berapa lama audit log disimpan? | V1 |

---

## 7. Prinsip yang mengikat

1. **Target-state boleh besar, eksekusi bertahap.** Bagian 3 adalah peta jangka panjang,
   bukan daftar kerja MVP.
2. **Jangan over-engineering.** Modular monolith, bukan microservices. Tidak ada abstraksi
   yang dibuat untuk kebutuhan yang belum ada.
3. **Modul harus terintegrasi, bukan berdiri sendiri.** Sales → Delivery → Inventory adalah
   satu rantai, bukan tiga aplikasi.
4. **Yang belum diputuskan tidak ditebak.** Tandai `DECISION REQUIRED`, naikkan ke owner.
