---
id: ADR-0003
title: Pencatatan stok memakai double-entry dengan lokasi virtual
status: accepted
date: 2026-09-16
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-0003 — Model Pencatatan Stok

## Konteks

Inventory adalah **buku besar barang**: semua modul lain (Sales, Purchase,
Manufacturing) menulis ke sana. Kalau modelnya salah, kesalahannya menyebar ke setiap
modul yang menyentuhnya, dan tidak bisa diperbaiki tanpa membongkar data transaksi.

Ini keputusan paling mahal untuk diubah di seluruh project — lebih mahal daripada
pilihan stack. Karena itu diputuskan sebelum satu baris kode Inventory ditulis,
meskipun modul Inventory baru dikerjakan di PRD-006.

Keputusan D-05 di `docs/PRODUCT-SCOPE.md` sudah dibekukan owner. ADR ini merinci
bentuknya.

---

## Opsi yang dipertimbangkan

### Opsi A — Double-entry dengan lokasi *(dipilih)*

Barang tidak pernah "muncul" atau "hilang". Barang selalu **pindah dari satu lokasi
ke lokasi lain**. Untuk lawan transaksinya, disediakan *lokasi virtual*.

```
Terima dari vendor 10 pcs :  Partner/Vendors  ──► WH/Stock
Kirim ke customer   3 pcs :  WH/Stock         ──► Partner/Customers
Opname, kurang      1 pcs :  WH/Stock         ──► Virtual/Inventory Loss
Transfer antar gudang 5   :  WH1/Stock        ──► WH2/Stock
```

- **Untung:** setiap perubahan stok punya lawan → tidak mungkin ada barang tanpa
  asal-usul. Satu tabel dan satu logika melayani receipt, delivery, adjustment, dan
  transfer. Pertanyaan "barang ini dari mana, ke mana, kapan, oleh siapa" selalu
  terjawab. Menambah jenis transaksi baru (produksi, scrap) cukup dengan menambah
  lokasi virtual, tanpa mengubah skema.
- **Rugi:** lebih abstrak untuk pemula. Butuh seed data lokasi virtual sejak awal.
  Salah memilih lokasi pada satu move menghasilkan angka yang aneh di dua tempat sekaligus.
- **Biaya berubah pikiran nanti:** sangat mahal.

### Opsi B — Single-entry ledger

`stock_move` berisi `warehouse_id`, `qty` bertanda +/−, dan `type`.

- **Untung:** langsung dipahami tanpa penjelasan.
- **Rugi:** setiap jenis transaksi butuh cabang logika sendiri. Adjustment tidak punya
  lawan, jadi selisih opname tidak bisa ditelusuri ke mana perginya. Transfer antar gudang
  harus ditulis sebagai dua baris yang dihubungkan secara konvensi — yaitu double-entry
  setengah jadi, tanpa jaminannya.
- **Biaya berubah pikiran nanti:** mahal.

### Opsi C — Kolom qty + tabel history

Kolom `on_hand` disimpan di tabel stok, tabel history terpisah untuk jejak.

- **Untung:** query on-hand paling cepat dan paling gampang dibaca.
- **Rugi:** dua sumber kebenaran yang bisa berbeda. Satu bug atau satu race condition
  membuat `on_hand` tidak cocok dengan history, dan tidak ada cara memastikan mana yang
  benar. Ini penyebab paling umum stok ERP tidak bisa direkonsiliasi.
- **Biaya berubah pikiran nanti:** sangat mahal — datanya sudah tidak dipercaya.

---

## Keputusan

**Opsi A — double-entry dengan lokasi virtual.**

Alasan:

1. Inventory adalah buku besar; buku besar yang setiap catatannya punya lawan adalah
   satu-satunya yang bisa dibuktikan benar. Ini prinsip yang sama dengan debit/kredit
   di akuntansi, dan alasannya sama.
2. Roadmap kita sudah memuat Purchase, Manufacturing, dan Return. Ketiganya adalah
   jenis pergerakan baru. Dengan Opsi A, ketiganya tidak menambah skema — hanya menambah
   lokasi. Dengan Opsi B, ketiganya menambah cabang logika.
3. Project ini juga bahan belajar. Opsi A adalah pola yang dipakai ERP sungguhan;
   mempelajarinya lebih bernilai daripada mempelajari penyederhanaan yang nanti dibuang.

---

## Bentuk yang mengikat

### Lokasi punya *type*

| `location_type` | Arti | Dihitung sebagai stok perusahaan? |
|---|---|---|
| `internal` | Gudang / rak milik kita | **Ya** |
| `vendor` | Titik asal barang dari pemasok | Tidak |
| `customer` | Titik tujuan barang ke pelanggan | Tidak |
| `inventory_loss` | Lawan dari stock adjustment | Tidak |
| `production` | Lawan dari konsumsi/hasil produksi *(dipakai nanti)* | Tidak |
| `transit` | Barang dalam perjalanan antar gudang | **Ya** |
| `view` | Simpul pengelompokan, tidak boleh menyimpan barang | Tidak |

**On-hand perusahaan = total barang di lokasi bertipe `internal` dan `transit`.**
Lokasi non-internal boleh bersaldo negatif — itu normal dan justru bermakna
(saldo `Partner/Vendors` yang makin negatif = total barang yang pernah kita terima).

Lokasi berbentuk **pohon** (`parent_id`), sehingga `WH/Stock/Rak-A` bisa ditanyakan
lewat induknya. Lokasi `view` hanya boleh jadi induk, tidak boleh jadi asal/tujuan move.

### Stock Move

| Kolom | Keterangan |
|---|---|
| `id`, `company_id`, base fields | standar `ADR-0002` |
| `product_id` | produk yang dipindah |
| `source_location_id` | dari mana |
| `dest_location_id` | ke mana |
| `quantity` | `NUMERIC(18,6)`, **selalu positif** |
| `uom_id` | satuan saat transaksi |
| `quantity_base` | hasil konversi ke UoM dasar produk — **ini yang dipakai berhitung** |
| `state` | `draft` → `ready` → `done` / `cancelled` |
| `effective_date` | kapan pergerakan dianggap terjadi |
| `reference` | nomor dokumen sumber (SO/2026/0001) |
| `source_document_type`, `source_document_id` | jejak balik ke dokumen asal |
| `unit_cost` | `NUMERIC(18,4)` — **disiapkan sekarang, dipakai di V1** |

Aturan keras:

- `quantity` **selalu positif**. Arah ditentukan oleh pasangan lokasi, bukan oleh tanda.
  Kuantitas negatif ditolak di level constraint database.
- `source_location_id != dest_location_id`.
- Move dalam state `done` **tidak bisa diubah dan tidak bisa dihapus**. Pembatalan
  dilakukan dengan membuat move balik (*reversal*) yang menunjuk ke move aslinya.
- `unit_cost` diisi sejak PRD-007 walaupun valuation belum dipakai. Alasannya: menambah
  nilai historis ke jutaan baris move yang sudah ada adalah pekerjaan yang tidak mungkin
  dilakukan dengan benar — biaya masa lalu tidak bisa direkonstruksi.

### Stock Quant — on-hand yang dimaterialisasi

Menghitung on-hand dengan `SUM` seluruh move setiap kali layar dibuka akan melambat
seiring data bertambah. Karena itu on-hand disimpan di tabel `stock_quant`:

| Kolom | Keterangan |
|---|---|
| `product_id`, `location_id` | kunci unik bersama `company_id` |
| `quantity` | total barang di lokasi itu (dalam UoM dasar) |
| `reserved_quantity` | bagian yang sudah dikunci untuk dokumen lain |

Yang membuat ini **berbeda dari Opsi C yang ditolak**:

1. `stock_quant` diperbarui **dalam transaksi database yang sama** dengan move-nya.
   Tidak ada jendela waktu di mana keduanya berbeda.
2. `stock_move` tetap **satu-satunya sumber kebenaran**. `stock_quant` adalah turunan
   yang selalu bisa dibangun ulang dari nol.
3. Wajib ada **fungsi rekonsiliasi** yang menghitung ulang quant dari move dan
   membandingkannya. Fungsi ini dijalankan dalam integration test setiap PRD Inventory.
   Kalau rekonsiliasi pernah menemukan selisih, itu bug yang memblokir rilis.

Update quant memakai **row-level lock** pada baris quant terkait (`SELECT ... FOR UPDATE`)
supaya dua pengiriman atas produk yang sama tidak saling menimpa.

### Reservasi

`reserved_quantity` mengunci barang tanpa memindahkannya.

```
Tersedia (available) = quantity − reserved_quantity
```

- Reservasi terjadi saat dokumen sumber keluar dari draft (mis. SO di-confirm).
- Reservasi dilepas saat dokumen dibatalkan, atau berubah jadi move `done` saat
  pengiriman divalidasi.
- Reservasi **tidak** mengubah `quantity`. Barangnya masih ada secara fisik.

---

## Yang belum diputuskan

| # | Pertanyaan | Harus dijawab sebelum |
|---|---|---|
| Q-01 | Stok boleh minus atau tidak? Kalau boleh, per warehouse atau global? Apa yang terjadi saat delivery melebihi on-hand? | PRD-007 |
| Q-02 | Costing method: FIFO / weighted average / standard cost? Menentukan apakah `stock_move` butuh tabel *cost layer* terpisah | V1 (Inventory valuation) |
| Q-09 | Apakah reservasi otomatis atau manual? Odoo punya keduanya | PRD-009 |

`DECISION REQUIRED` — sesi Coder **tidak boleh menebak** salah satu dari ini.

---

## Konsekuensi

**Positif**
- Menambah Purchase, Return, Manufacturing, dan Scrap nanti tidak mengubah skema stok.
- Setiap butir barang bisa ditelusuri asal-usulnya tanpa kolom tambahan.
- Rekonsiliasi stok bisa dibuktikan secara otomatis, bukan dipercaya begitu saja.

**Harga yang dibayar**
- Setiap operasi stok menulis ke dua tabel dalam satu transaksi, dengan locking.
- Butuh seed lokasi virtual di setiap company baru — kalau lupa, seluruh Inventory
  tidak bisa dipakai.
- Konsep lokasi virtual perlu dijelaskan ke siapa pun yang membaca kode untuk
  pertama kali.

**Yang jadi wajib mulai sekarang**
1. Tidak ada kuantitas negatif di `stock_move`.
2. Tidak ada perubahan stok di luar `stock_move`.
3. Tidak ada `stock_quant` yang di-update di luar transaksi move-nya.
4. Tidak ada move `done` yang diedit atau dihapus — hanya di-reverse.
5. Setiap company baru wajib langsung punya set lokasi virtualnya.

---

## Cara mengecek kepatuhan

| Aturan | Cara mengecek |
|---|---|
| Kuantitas positif | `CHECK (quantity > 0)` di level database |
| Lokasi asal ≠ tujuan | `CHECK (source_location_id <> dest_location_id)` |
| Quant konsisten dengan move | Fungsi rekonsiliasi dijalankan di akhir setiap integration test Inventory |
| Tidak ada stok berubah di luar move | Review: tidak ada service selain Inventory yang menulis ke `stock_quant` |
| Concurrency aman | Integration test yang menjalankan dua pengiriman paralel atas produk yang sama dan memeriksa hasil akhirnya |

---

## Kapan ADR ini perlu ditinjau ulang

- Saat lot/serial number masuk (V2) → `stock_quant` bertambah dimensi `lot_id`,
  dan reservasi harus memilih lot. Strukturnya tetap, kuncinya bertambah.
- Saat Inventory valuation masuk (V1) → tinjau apakah `unit_cost` di move cukup atau
  perlu tabel *valuation layer* terpisah.
- Saat volume `stock_move` melewati ~10 juta baris → tinjau strategi partisi tabel.
