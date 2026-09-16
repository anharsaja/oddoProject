# 01 — Anatomi ERP & Kenapa Urutan Modul Menentukan Segalanya

> Materi ini jadi dasar keputusan "modul mana yang dikerjakan duluan".
> Dibaca sebelum menjawab pertanyaan Discovery batch 1.

---

## 1. ERP itu bukan kumpulan CRUD

Aplikasi CRUD: satu tabel, empat operasi, selesai. Tidak ada yang terjadi di tempat lain
saat kamu menekan Simpan.

ERP: menekan satu tombol di satu modul **mengubah data di tiga modul lain**, dan semua
perubahan itu harus konsisten atau tidak terjadi sama sekali.

Contoh konkret — tombol **Confirm** di satu Sales Order:

| Yang terjadi | Di modul |
|---|---|
| State SO: `draft` → `confirmed` | Sales |
| Nomor dokumen final diberikan (SO/2026/0001) | Core (sequence) |
| Delivery Order otomatis dibuat, status `ready` | Inventory |
| Stok produk di-*reserve* (belum keluar, tapi sudah dikunci) | Inventory |
| Baris audit log dicatat (siapa, kapan, dari state apa) | Core |
| Notifikasi ke gudang | Core |

Kalau salah satu gagal, **semuanya harus batal**. Itulah bedanya ERP dengan CRUD:
yang sulit bukan menyimpan data, tapi menjaga *efek samping* tetap konsisten.

**Konsekuensi untuk kita:** setiap PRD wajib punya bagian "Efek samping" di tabel
transisi state. Bukan formalitas — itu justru inti pekerjaannya.

---

## 2. Tiga lapis yang selalu ada di ERP mana pun

```
┌─────────────────────────────────────────────────────────┐
│ LAPIS 3 — DOKUMEN TRANSAKSI                             │
│ Sales Order, Delivery, Invoice, Purchase Order, MO      │
│ Punya state machine. Punya nomor. Punya efek samping.   │
└──────────────────────────┬──────────────────────────────┘
                           │ mengacu ke
┌──────────────────────────▼──────────────────────────────┐
│ LAPIS 2 — MASTER DATA                                   │
│ Partner (customer/vendor), Product, UoM, Warehouse,     │
│ Tax, Payment Term, Chart of Accounts                    │
│ Jarang berubah. Tidak punya state machine.              │
└──────────────────────────┬──────────────────────────────┘
                           │ berdiri di atas
┌──────────────────────────▼──────────────────────────────┐
│ LAPIS 1 — FONDASI / PLATFORM                            │
│ User, Company, Permission, Sequence, Audit Log,         │
│ Attachment, Notification, Settings                      │
│ Dipakai SEMUA modul. Paling mahal kalau salah desain.   │
└─────────────────────────────────────────────────────────┘
```

Aturan besinya: **tidak boleh membangun lapis atas sebelum lapis bawahnya ada.**
Membalik urutan ini adalah cara paling umum project ERP jadi kacau — karena
menambahkan `company_id` ke 40 tabel yang sudah berisi data jauh lebih mahal
daripada menaruhnya sejak awal.

---

## 3. Bagaimana Odoo menyusun fondasinya

Tiga keputusan Odoo yang layak kita tiru **konsepnya** (bukan kodenya):

### a. Satu tabel partner untuk semua pihak

Odoo tidak punya tabel `customer` dan tabel `vendor` terpisah. Semuanya `res.partner`,
dibedakan oleh flag (`customer_rank`, `supplier_rank`).

**Kenapa:** di dunia nyata satu perusahaan bisa jadi customer *sekaligus* vendor.
Kalau dipisah, kamu menyimpan alamat dan NPWP yang sama dua kali, lalu keduanya
berbeda setelah enam bulan.

### b. Product punya *type*, bukan tabel terpisah

Satu tabel produk, dengan field `type`:

| Type | Punya stok? | Contoh |
|---|---|---|
| `stockable` | ya, dilacak stock move | barang dagangan |
| `consumable` | tidak dilacak, boleh keluar bebas | alat tulis |
| `service` | tidak ada fisiknya | jasa instalasi, konsultasi |

**Kenapa:** Sales Order harus bisa memuat barang dan jasa dalam satu dokumen.

### c. Keamanan dua lapis

| Lapis | Pertanyaannya | Contoh |
|---|---|---|
| **Access right** | boleh tidak menyentuh *jenis data* ini? | Sales Staff boleh read+create Sales Order, tidak boleh delete |
| **Record rule** | dari semua baris yang ada, boleh lihat yang *mana*? | Sales Staff hanya lihat SO milik company-nya sendiri |

Lapis kedua inilah yang paling sering dilupakan aplikasi buatan sendiri — dan jadi
lubang keamanan terbesar: permission-nya benar, tapi user bisa melihat data company lain.

---

## 4. Peta dependency antar modul

```
                    ┌──────────────────────────┐
                    │  CORE                    │
                    │  user · company · partner│
                    │  product · permission    │
                    │  sequence · audit        │
                    └───┬──────────┬───────┬───┘
                        │          │       │
          ┌─────────────┘          │       └─────────────┐
          ▼                        ▼                     ▼
      ┌────────┐             ┌───────────┐          ┌────────┐
      │  CRM   │             │ INVENTORY │          │   HR   │
      │lead/opp│             │stock move │          │        │
      └───┬────┘             └─────▲─────┘          └────────┘
          │                        │
          ▼                        │
      ┌────────┐   delivery ───────┤
      │ SALES  ├───────────────────┘
      └───┬────┘                   ▲
          │ invoice                │ receipt
          ▼                        │
     ┌──────────┐             ┌────┴─────┐
     │ACCOUNTING│◄────bill────│ PURCHASE │
     │ journal  │             └──────────┘
     └──────────┘

     MANUFACTURING ──► INVENTORY + ACCOUNTING
```

Yang bisa dibaca dari graf ini:

- **CORE tidak punya dependency** → wajib pertama, tanpa perdebatan.
- **INVENTORY dan ACCOUNTING adalah "buku besar"** — keduanya hanya menerima catatan
  dari modul lain. Stock Move adalah buku besar barang; Journal Entry adalah buku besar uang.
  Keduanya harus benar sejak awal karena seluruh modul lain menulis ke sana.
- **SALES dan PURCHASE adalah "pintu masuk"** — mereka yang menghasilkan dokumen,
  tapi tidak berguna tanpa buku besarnya.
- **MANUFACTURING dependency-nya paling berat** (butuh Inventory + Accounting matang)
  → selalu belakangan.

---

## 5. Tiga strategi urutan pengerjaan

### Strategi A — Bottom-up (fondasi → buku besar → dokumen)

`Core → Inventory → Sales → Accounting`

- **Untung:** bagian tersulit (stock move, ledger) dikerjakan saat energi masih penuh
  dan belum ada data yang perlu dimigrasi. Modul berikutnya tinggal menumpang.
- **Rugi:** butuh waktu lama sebelum ada layar yang terasa berguna.
  Inventory tanpa Sales terasa seperti aplikasi gudang biasa.

### Strategi B — Thin slice / golden thread (tipis tapi tembus semua lapisan)

`Core minimal → Sales sederhana → Inventory sederhana → sambungkan → perdalam`

- **Untung:** cepat punya alur end-to-end yang bisa didemo; salah desain ketahuan lebih awal
  karena semua lapisan sudah tersentuh.
- **Rugi:** godaan untuk menunda perbaikan jadi besar. Kalau disiplin ADR longgar,
  hasilnya prototype yang tidak bisa dilanjutkan.

### Strategi C — Money-first

`Core → Accounting → Sales → Inventory`

- **Untung:** cocok kalau tujuan utamanya laporan keuangan.
- **Rugi:** Accounting tanpa transaksi sumber = input jurnal manual. Untuk belajar,
  ini melewatkan bagian yang paling banyak mengajarkan, yaitu integrasi antar modul.

---

## 6. Rekomendasi awal untuk project ini

**Strategi A, dengan satu pelonggaran dari Strategi B.**

> Daftar PRD final ada di **`docs/PRODUCT-SCOPE.md` bagian 4** — itu yang mengikat.
> Yang di bawah ini hanya bentuk kasarnya untuk menjelaskan alasannya.

```
CORE fondasi   → auth, user, company, permission, audit, sequence
CORE master    → partner, product, UoM, kategori, tax
INVENTORY      → warehouse, location, stock move, on-hand, opening stock
SALES          → quotation → sales order (belum sampai invoice)
SALES→DELIVERY → sambungan ke Inventory: reservasi + stock move nyata
```

Alasannya:

1. **Stok masuk tidak butuh modul Purchase.** Cukup *Inventory Adjustment* (opening stock).
   Jadi Purchase bisa ditunda tanpa kehilangan kemampuan menguji Sales.
2. **Sales → Delivery → Inventory adalah rantai terpendek yang mengajarkan integrasi.**
   Setelah pola itu dikuasai, menambah Purchase dan Accounting jadi pengulangan pola yang sama.
3. **Accounting ditunda ke V1, bukan dibuang.** Tapi desain Stock Move sudah harus
   menyimpan nilai (cost) sejak awal, supaya jurnal bisa ditempelkan belakangan
   tanpa migrasi besar.

Pelonggarannya: PRD-001 dan PRD-002 sengaja **tidak** membangun seluruh Core dari brief
(notification, attachment, automation ditunda). Hanya yang benar-benar dibutuhkan
modul berikutnya yang dibangun sekarang.

---

## 7. Jawaban owner (Discovery, 2026-09-16)

Keempat pertanyaan yang tadinya terbuka sudah dijawab. Semuanya dibekukan di
`docs/PRODUCT-SCOPE.md` bagian 2.

| Pertanyaan | Jawaban | Akibatnya di bagian 6 |
|---|---|---|
| Jenis bisnis | Trading / distribusi | Produk fisik + gudang jadi inti. Multi-UoM perlu (beli dus, jual pcs); lot/serial tidak |
| Multi-company | Ready, UI single | `company_id` masuk ke semua tabel sejak PRD pertama |
| Kedalaman permission | RBAC string + record rule company | PRD Core terpecah jadi dua: auth dulu, baru RBAC |
| Modul MVP | Core → Inventory → Sales | Urutan di bagian 6 **dikonfirmasi**, tidak berubah |

Satu keputusan tambahan yang tidak ada di daftar awal tapi ternyata paling menentukan:
**model pencatatan stok memakai double-entry dengan lokasi virtual** — lihat
`docs/adr/ADR-0003-model-pencatatan-stok.md`.
