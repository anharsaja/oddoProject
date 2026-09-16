---
id: ADR-0002
title: Arsitektur inti — struktur modul, multi-company, model hak akses, audit, dan batas satu PRD
status: accepted
date: 2026-09-16
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-0002 — Arsitektur Inti

## Konteks

`ADR-0001` memutuskan **teknologi apa** yang dipakai. ADR ini memutuskan **pola yang
dipakai berulang oleh setiap modul**: bagaimana modul disusun, bagaimana data disekat
per company, bagaimana hak akses dicek, dan apa yang wajib dicatat.

Kalau pola ini tidak diputuskan sekarang, setiap PRD akan menemukan caranya sendiri —
dan modul ke-5 tidak akan cocok dengan modul ke-1.

Batasan yang berlaku: keputusan D-03 (multi-company ready, UI single) dan D-04
(RBAC string + record rule company) dari `docs/PRODUCT-SCOPE.md` sudah dibekukan owner.
ADR ini menentukan **cara mewujudkannya**, bukan mempertanyakannya.

---

## 1. Struktur modul

### Keputusan

Modular monolith dengan **folder per modul** dan **arah dependency satu arah**.

```
apps/api/src/
├── main.ts
├── app.module.ts
├── common/                  ← dipakai semua modul, tidak boleh punya business logic
│   ├── decorators/          @RequirePermission, @CurrentUser, @CurrentCompany
│   ├── guards/              AuthGuard, PermissionGuard
│   ├── interceptors/        RequestIdInterceptor, AuditInterceptor
│   ├── filters/             AllExceptionsFilter
│   ├── context/             RequestContext (AsyncLocalStorage)
│   └── prisma/              PrismaService
│
├── core/                    ← LAPIS 1 + 2: fondasi & master data
│   ├── auth/
│   ├── users/
│   ├── companies/
│   ├── permissions/
│   ├── audit/
│   ├── sequences/
│   ├── settings/
│   ├── partners/
│   ├── products/
│   ├── uom/
│   ├── taxes/
│   └── currencies/
│
├── inventory/               ← LAPIS 3: buku besar barang
│   ├── warehouses/
│   ├── locations/
│   ├── quants/
│   ├── moves/
│   └── adjustments/
│
└── sales/                   ← LAPIS 3: dokumen penjualan
    ├── quotations/
    ├── orders/
    └── deliveries/
```

### Aturan dependency (mengikat)

```
sales      ──boleh──► inventory ──boleh──► core ──boleh──► common
core       ──TIDAK BOLEH──► inventory / sales
inventory  ──TIDAK BOLEH──► sales
common     ──TIDAK BOLEH──► modul mana pun
```

Alasannya: `core` harus bisa berdiri sendiri tanpa modul bisnis apa pun. Begitu `core`
mengimpor sesuatu dari `sales`, modularitasnya hanya tinggal nama folder.

### Bagaimana modul berkomunikasi

Setiap modul mengekspos **satu file publik** (`<modul>.public.ts`) berisi service dan
tipe yang boleh dipakai modul lain. Sisanya internal.

```ts
// inventory/inventory.public.ts — SPESIFIKASI, bukan kode final
export interface InventoryPublicService {
  reserve(input: ReserveStockInput): Promise<ReservationResult>
  unreserve(reservationId: string): Promise<void>
  createMove(input: CreateStockMoveInput): Promise<StockMove>
}
```

Modul `sales` memanggil `InventoryPublicService`, **tidak pernah** memanggil
`StockMoveRepository` langsung dan **tidak pernah** menulis ke tabel milik Inventory.

### Opsi yang ditolak

| Opsi | Kenapa ditolak |
|---|---|
| Layer-first (`controllers/`, `services/`, `repositories/` di root) | Satu perubahan fitur menyentuh 4 folder berjauhan. Batas modul jadi tidak terlihat sama sekali |
| Event-driven penuh antar modul sejak awal | Menambah asynchronicity, eventual consistency, dan debugging yang berat — padahal semua modul masih satu proses dan satu transaksi database |
| Package npm terpisah per modul | Overhead build dan versioning besar untuk satu tim satu orang |

Domain event tetap dipakai, tapi **hanya untuk efek samping yang boleh gagal terpisah**
(notifikasi, pengiriman email). Efek samping yang harus atomic (stok berubah saat SO
di-confirm) dipanggil langsung dalam satu transaksi database.

---

## 2. Multi-company & record rule

### Keputusan

Setiap tabel bisnis punya `company_id UUID NOT NULL`. Penyaringan dilakukan di
**repository layer lewat base class yang mewajibkan `companyId` sebagai argumen**,
bukan lewat `where` manual di setiap service.

### Opsi yang dipertimbangkan

| Opsi | Untung | Rugi |
|---|---|---|
| **Base repository yang mewajibkan `companyId` (dipilih)** | TypeScript menolak compile kalau `companyId` lupa diisi. Eksplisit, mudah dilacak saat debugging | Sedikit lebih berisik di kode pemanggil |
| Prisma Client Extension yang menyuntik `where` otomatis | Tidak mungkin lupa, kode pemanggil bersih | "Magic": saat query berperilaku aneh, sebabnya tidak kelihatan di kode. Nested write dan raw query lolos dari penyuntikan — dan justru itu yang berbahaya |
| Postgres Row Level Security | Ditegakkan database, tidak bisa dilewati kode | Perlu set session variable per koneksi; berinteraksi rumit dengan connection pool Prisma. Error RLS sulit dibaca |
| Filter manual di tiap service | Tidak ada abstraksi baru | Pasti ada yang lupa. Satu lupa = kebocoran data lintas company |

Yang ditolak bukan karena buruk — RLS justru paling aman. Tapi untuk project yang juga
berfungsi sebagai bahan belajar, mekanisme yang **terlihat di kode** lebih berharga
daripada mekanisme yang tersembunyi di database. Ini ditinjau ulang kalau multi-company
sungguhan diaktifkan di V2.

### Aturan konkret

1. `company_id` **NOT NULL** di semua tabel bisnis. Pengecualian hanya untuk data global
   sistem: `currency`, `permission`, `uom_category`, `system_setting`.
2. Company aktif user diambil dari session, **tidak pernah** dari body request atau query
   param. Kalau client mengirim `companyId`, nilai itu diabaikan.
3. Setiap integration test untuk endpoint list wajib punya kasus:
   *"user company A tidak melihat data company B"*. Tanpa itu, PRD belum selesai.
4. Foreign key lintas company dilarang. Kalau `sales_order.partner_id` menunjuk partner
   dari company lain, itu bug — dijaga dengan validasi di service dan diuji.

### Kenapa dilakukan sekarang padahal UI-nya single-company

Menambahkan `company_id` ke 40 tabel berisi data berarti: menulis migrasi backfill yang
harus menebak company mana untuk setiap baris lama, mengubah setiap query, mengubah setiap
unique constraint (`code` unik global → unik per company), dan menguji ulang semuanya.
Melakukannya sekarang berarti mengetik satu baris tambahan per tabel.

---

## 3. Model hak akses

### Keputusan: dua lapis, seperti Odoo

```
Lapis 1 — ACCESS RIGHT   "boleh menyentuh jenis data ini?"   → permission string
Lapis 2 — RECORD RULE    "boleh melihat baris yang mana?"     → filter company_id
```

Keduanya harus lolos. Lolos lapis 1 tapi gagal lapis 2 berarti data tidak terlihat —
bukan error 403, tapi 404 atau baris yang tidak muncul di list. Alasannya: memberi tahu
"data ini ada tapi kamu tidak boleh lihat" sendiri sudah membocorkan informasi.

### Format permission

```
<modul>.<objek>.<aksi>

core.user.read          core.user.create        core.user.update
sales.order.read        sales.order.confirm     sales.order.cancel
inventory.move.read     inventory.adjustment.validate
```

- Aksi standar: `read`, `create`, `update`, `delete`
- Aksi khusus state machine memakai nama transisinya: `confirm`, `cancel`, `validate`,
  `approve`. **Bukan** digabung ke dalam `update` — kemampuan mengedit draft sangat
  berbeda dari kemampuan mengonfirmasi dokumen.

### Model data

```
User ──N:M── Role ──N:M── Permission
                │
                └── company_id (role bisa global atau milik satu company)
```

- Permission adalah **data**, bukan enum di kode. Ditambah lewat seed saat modul baru
  masuk, sehingga menambah permission tidak perlu deploy ulang.
- Role adalah kumpulan permission yang bisa diatur admin. Tidak ada permission yang
  menempel langsung ke user.
- Satu user boleh punya lebih dari satu role; permission efektifnya adalah **gabungan**
  (union), tidak ada konsep "deny" yang membatalkan. Deny ditolak karena membuat
  penelusuran "kenapa user ini bisa/tidak bisa" jadi berlipat rumit.
- `is_superadmin` pada user melewati lapis 1 tapi **tetap tunduk pada lapis 2**.

### Penegakan

```ts
// SPESIFIKASI
@Post(':id/confirm')
@RequirePermission('sales.order.confirm')
confirm(@Param('id') id: string, @CurrentCompany() companyId: string) { ... }
```

- `AuthGuard` → memastikan session valid, mengisi `RequestContext`
- `PermissionGuard` → membaca metadata `@RequirePermission`, mencocokkan dengan
  permission efektif user
- Endpoint **tanpa** `@RequirePermission` ditolak saat boot, kecuali ditandai eksplisit
  `@Public()`. Lupa memasang guard tidak boleh berarti endpoint terbuka.

---

## 4. Field standar & audit

### Base fields — wajib di setiap tabel bisnis

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID v7 | PK |
| `company_id` | UUID | FK company (kecuali tabel global sistem) |
| `created_at` | timestamptz | otomatis |
| `created_by` | UUID | FK user |
| `updated_at` | timestamptz | otomatis |
| `updated_by` | UUID nullable | FK user |
| `active` | boolean default true | **archive**, bukan delete |

### Apa yang dihitung sebagai "tabel bisnis"

Aturan di atas berlaku untuk **tabel bisnis**: tabel yang dikelola user lewat layar,
atau yang direferensikan oleh dokumen. Yang **bukan** tabel bisnis dan karena itu bebas
dari base fields:

| Jenis | Contoh | Yang tidak dipakai |
|---|---|---|
| Setelan tingkat instance | `system_setting` | `company_id`, `created_by`, `updated_by`, `active` |
| Katalog sistem yang hanya diisi seed | `permission`, `uom_category` | `company_id`, `active` |
| Tabel append-only | `audit_log` | `updated_by`, `updated_at`, `active` — barisnya memang tidak pernah diubah |
| Milik infrastruktur | `_prisma_migrations` | semuanya |

Satu pengecualian yang bersifat sementara, bukan permanen: **sebelum tabel `user` ada
(yaitu di PRD-000), `created_by` dan `updated_by` mustahil dibuat** karena tidak ada
target foreign key-nya. Tabel apa pun yang dibuat sebelum PRD-001 bebas dari kedua field
itu, dan PRD yang membuatnya **wajib menuliskan alasannya di bagian 7.2**, bukan
membiarkannya kosong tanpa penjelasan.

Kalau ragu sebuah tabel termasuk kategori mana: pakai base fields lengkap. Kelebihan
kolom audit jauh lebih murah daripada kekurangannya.

### Archive, bukan delete

Dokumen bisnis **tidak pernah dihapus permanen**. Master data yang tidak dipakai lagi
di-set `active = false` dan hilang dari list default, tapi dokumen lama yang menunjuknya
tetap utuh.

Alasannya: menghapus produk yang pernah dijual akan merusak Sales Order tahun lalu.
Di ERP, data lama adalah bukti — bukan sampah.

`delete` yang sungguhan hanya boleh untuk record berstatus `draft` yang belum pernah
punya nomor final dan belum punya dokumen turunan.

### Audit log

Tabel `audit_log` terpisah, **append-only** (tidak ada update, tidak ada delete).

| Kolom | Isi |
|---|---|
| `id`, `company_id`, `created_at` | standar |
| `actor_id` | siapa (`who`) |
| `entity_type`, `entity_id` | objek apa |
| `action` | `create` / `update` / `delete` / `confirm` / `cancel` / `validate` / `permission_change` / `login` / `login_failed` |
| `before` | JSONB — nilai sebelum, hanya field yang berubah |
| `after` | JSONB — nilai sesudah |
| `reason` | teks, wajib untuk `cancel` dan `adjustment` |
| `request_id`, `ip`, `user_agent` | jejak teknis |

**Yang wajib masuk audit log:**
semua transisi state, semua perubahan permission/role, login berhasil dan gagal,
stock adjustment, penghapusan, dan setiap perubahan pada master data keuangan (pajak, currency).

**Yang tidak perlu:** operasi read. Kalau suatu saat butuh, itu access log terpisah —
jangan mencampurnya ke sini, volumenya beda kelas.

`before`/`after` **tidak boleh** memuat password hash, session id, atau token.

---

## 5. State machine dokumen

Setiap dokumen bisnis memakai pola yang sama:

1. **State adalah kolom `state`** bertipe enum di database, bukan boolean berserakan
   (`is_confirmed`, `is_done`, `is_cancelled` — pola itu dilarang, karena membolehkan
   kombinasi yang mustahil).
2. **Transisi hanya lewat method khusus** (`confirm()`, `cancel()`), tidak pernah lewat
   `update()` generik. Endpoint `PATCH` menolak perubahan kolom `state`.
3. **Setiap transisi berjalan dalam satu transaksi database** bersama seluruh efek
   sampingnya. Kalau pembuatan Delivery Order gagal, confirm SO ikut batal.
4. **Setiap transisi menulis audit log** dalam transaksi yang sama.
5. **Dokumen dalam state final tidak bisa diedit.** Perbaikan dilakukan dengan membatalkan
   dan membuat yang baru, atau lewat dokumen koreksi — tergantung modul.
6. **Nomor final terbit saat transisi keluar dari `draft`**, bukan saat record dibuat.
   Draft memakai nomor sementara. Alasannya: draft yang dibatalkan tidak boleh
   meninggalkan lubang di urutan nomor dokumen resmi.

---

## 6. Batas satu PRD

### Keputusan: satu PRD = satu *vertical slice* yang dipersempit

Setiap PRD mengantarkan backend **dan** UI secukupnya untuk fitur yang dicakupnya,
dengan cakupan dipersempit sampai muat satu sesi Coder.

| Opsi | Untung | Rugi |
|---|---|---|
| **Vertical slice dipersempit (dipilih)** | Setiap PRD selesai menghasilkan sesuatu yang bisa dicoba manusia. Salah asumsi UX ketahuan awal | Butuh disiplin memecah fitur jadi irisan kecil |
| Backend dulu semua, UI belakangan | Backend bisa didesain utuh tanpa kompromi | Berbulan-bulan tanpa layar yang bisa dipakai. Ketika UI dibuat, ketahuan API-nya tidak pas — dan sudah telanjur banyak |
| Backend & UI sebagai PRD berpasangan | Tiap PRD kecil | Status `done` jadi ambigu: backend selesai tapi fiturnya belum bisa dipakai siapa pun |

**Ukuran yang dianggap kebesaran** (tanda PRD harus dipecah):
lebih dari ~6 tabel baru, atau lebih dari ~10 endpoint, atau menyentuh lebih dari
2 modul sekaligus, atau ada lebih dari satu state machine baru.

### Heuristik di atas buta terhadap PRD infrastruktur

Keempat ukuran itu menghitung **kompleksitas bisnis**. PRD yang isinya menyiapkan
perkakas — scaffolding, migrasi besar, penggantian library, pemasangan CI — bisa
mendapat skor nyaris nol di keempatnya dan tetap menghabiskan satu sesi penuh.
PRD-000 contohnya: 1 tabel, 1 endpoint, 0 modul, 0 state machine, tapi justru
PRD terberat di seluruh roadmap.

Untuk PRD jenis ini, ukuran yang dipakai adalah **jumlah perkakas baru yang harus
dikonfigurasi dari nol**. Lebih dari ~8 (package manager, container, ORM, test runner,
linter, logger, framework backend, framework frontend, dan seterusnya) berarti PRD-nya
berat, terlepas dari berapa tabel yang dibuat.

Kalau PRD infrastruktur tidak bisa dipecah tanpa merusak nilainya — misalnya karena
ada acceptance criteria yang menuntut dua sisi ada sekaligus — **jangan dipecah**.
Gantinya, tanamkan **checkpoint eksplisit** di bagian 13: satu titik di tengah rencana
implementasi yang hasilnya utuh, bisa di-commit, dan aman dijadikan tempat berhenti
kalau sesi harus dipotong.

---

## Konsekuensi

**Positif**
- Modul ke-9 akan terlihat seperti modul ke-1. Sesi Coder yang berbeda menghasilkan
  bentuk kode yang sama.
- Kebocoran data lintas company jadi kesalahan yang sulit dilakukan, bukan yang mudah.
- Setiap dokumen bisnis otomatis punya jejak audit tanpa dipikirkan lagi per PRD.

**Harga yang dibayar**
- Base repository dengan `companyId` eksplisit membuat kode pemanggil lebih berisik.
- Archive-bukan-delete berarti setiap query list harus ingat `active = true`, dan
  setiap unique constraint harus memperhitungkan baris ter-archive.
- Aturan "nomor terbit saat keluar dari draft" menambah satu langkah di setiap
  state machine.

**Yang jadi wajib mulai sekarang**
1. Tidak ada query ke tabel bisnis tanpa `companyId`.
2. Tidak ada endpoint tanpa `@RequirePermission` atau `@Public()`.
3. Tidak ada transisi state di luar transaksi database.
4. Tidak ada `DELETE` fisik pada dokumen yang pernah punya nomor final.
5. Tidak ada modul yang menulis ke tabel milik modul lain.

---

## Cara mengecek kepatuhan

| Aturan | Cara mengecek |
|---|---|
| Arah dependency modul | ESLint `import/no-restricted-paths` + review struktur folder |
| Tidak ada endpoint tanpa guard | Test yang memindai seluruh route saat boot dan gagal kalau ada yang tanpa metadata permission |
| Isolasi company | Setiap PRD dengan endpoint list wajib punya test "company A tidak melihat data company B" |
| Transisi atomic | Integration test yang memaksa efek samping gagal, lalu memastikan state tidak berubah |
| Audit tercatat | Integration test per transisi yang memeriksa baris `audit_log` |

---

## Kapan ADR ini perlu ditinjau ulang

- Saat multi-company sungguhan diaktifkan (V2) → tinjau ulang bagian 2, khususnya
  apakah Postgres RLS layak dipasang sebagai lapis pengaman kedua.
- Saat modul ke-6 masuk → periksa apakah aturan dependency masih realistis atau sudah
  ada kebutuhan domain event yang sebenarnya.
- Saat jumlah permission melewati ~150 → tinjau apakah perlu konsep grup/kategori
  permission agar layar Role masih terpakai.
