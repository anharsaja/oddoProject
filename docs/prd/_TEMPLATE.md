---
id: PRD-00X
title: <judul singkat, apa yang dibangun>
status: draft            # draft | ready | in-progress | review | done | blocked
priority: P0             # P0 core/blocking, P1 MVP, P2 V1, P3 V2, P4 future
modules: []              # contoh: [core, inventory]
depends_on: []           # contoh: [PRD-001]
blocks: []               # PRD yang menunggu ini selesai
estimasi: <~X jam / 1 sesi coder>
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# PRD-00X — <Judul>

> Pembaca dokumen ini adalah engineer yang **belum pernah ikut diskusi apa pun**
> tentang project ini. Semua yang dia butuhkan harus ada di sini.

---

## 1. Ringkasan

<2–4 kalimat: apa yang dibangun, untuk siapa, kenapa sekarang.>

**Masalah yang diselesaikan:**
<Kondisi sekarang tanpa fitur ini, dan kenapa itu jadi masalah.>

---

## 2. Scope

### 2.1 Termasuk (In Scope)
- [ ] <hal konkret yang harus jadi>

### 2.2 Tidak Termasuk (Out of Scope)
- <hal yang sengaja ditunda> — ditunda ke: <PRD berikutnya / V1 / V2 / Future>

### 2.3 Asumsi
- <asumsi yang dipegang; kalau salah, PRD ini harus direvisi>

---

## 3. Dependency

| Arah | Item | Keterangan |
|---|---|---|
| Butuh | <PRD-00X / ADR-000X> | <kenapa> |
| Memblokir | <PRD-00Y> | <kenapa> |

**ADR yang mengikat PRD ini:** <daftar ADR + aturan spesifik yang wajib dipatuhi>

---

## 4. User Story

```text
US-00X-01

Title:   <judul>
As a:    <role>
I want:  <kemampuan>
So that: <nilai bisnisnya>
Priority: MVP
```

<Ulangi untuk tiap story. Satu PRD biasanya 2–6 story.>

---

## 5. Business Workflow & State Machine

### 5.1 Diagram state

```text
draft ──confirm──► confirmed ──done──► done
  │                    │
  └──cancel──────────► cancelled
```

### 5.2 Tabel transisi

| Dari | Aksi | Ke | Siapa yang boleh | Prasyarat | Efek samping | Reversible? |
|---|---|---|---|---|---|---|
| draft | confirm | confirmed | <permission> | <kondisi> | <dokumen/stok/jurnal/notifikasi yang tercipta> | tidak |

> Untuk tiap transisi wajib dijawab: inventory berubah? accounting berubah?
> notifikasi dikirim? audit log dibuat? dokumen turunan dibuat? butuh approval?

---

## 6. Business Rules

```text
BR-<MODUL>-001

<Pernyataan aturan yang bisa dibuktikan benar/salah.>

Berlaku saat : <kapan dicek>
Jika dilanggar: <error code + pesan ke user>
```

<Ulangi. Aturan yang belum diputuskan TIDAK boleh ditulis di sini —
pindahkan ke bagian "Open Questions" dan set status: blocked.>

---

## 7. Data Model

### 7.1 Entity & relationship

```text
<Entity>
 ├── <relasi 1:N>
 └── <relasi N:1>
```

### 7.2 Definisi field

**Tabel: `<nama_tabel>`**

| Field | Tipe | Null? | Default | Unique | Keterangan |
|---|---|---|---|---|---|
| id | uuid | no | generated | yes | PK |
| company_id | uuid | no | — | no | FK company, dasar record rule |
| created_at | timestamptz | no | now() | no | audit |
| created_by | uuid | no | — | no | audit |
| updated_at | timestamptz | no | now() | no | audit |
| updated_by | uuid | yes | — | no | audit |

**Index:** <daftar index + alasannya>
**Constraint:** <unique composite, check constraint, FK on-delete behaviour>
**Migrasi data:** <seed / backfill yang diperlukan, atau "tidak ada">

---

## 8. Permission

| Permission string | Keterangan | Role default |
|---|---|---|
| `<modul>.<objek>.read` | | |
| `<modul>.<objek>.create` | | |
| `<modul>.<objek>.update` | | |
| `<modul>.<objek>.delete` | | |
| `<modul>.<objek>.<aksi>` | | |

**Record rule (filter baris):**
| Role | Aturan |
|---|---|
| <role> | hanya record dengan `company_id` = company aktif user |

---

## 9. API Contract

### `POST /api/<modul>/<resource>`

- **Purpose:** <untuk apa>
- **Authorization:** `<permission string>`
- **Request body:**
  ```json
  {}
  ```
- **Response 201:**
  ```json
  {}
  ```
- **Validation:** <aturan per field>
- **Errors:**
  | HTTP | Code | Kapan terjadi |
  |---|---|---|
  | 400 | `VALIDATION_ERROR` | |
  | 403 | `FORBIDDEN` | |
  | 404 | `NOT_FOUND` | |
  | 409 | `STATE_CONFLICT` | |
- **Side effects:** <perubahan data lain, audit log, notifikasi>
- **Idempotency:** <ya/tidak + caranya>

<Ulangi untuk tiap endpoint.>

---

## 10. UI/UX Requirements

| Aspek | Ketentuan |
|---|---|
| Lokasi di navigasi | <menu → submenu> |
| List page | kolom, filter, sort, pagination, search, bulk action |
| Form page | field, urutan, field wajib, field read-only per state |
| Aksi | tombol apa muncul di state apa, untuk permission apa |
| Empty state | <teks + CTA> |
| Loading state | <skeleton/spinner> |
| Error state | <bagaimana error API ditampilkan> |
| Permission denied | <menu disembunyikan / tombol disabled / halaman 403> |
| Konfirmasi | <aksi mana yang butuh dialog konfirmasi> |

---

## 11. Edge Cases & Error Handling

| # | Skenario | Perilaku yang benar |
|---|---|---|
| 1 | <mis. dua user confirm dokumen yang sama bersamaan> | <mis. optimistic lock, user kedua dapat 409> |

---

## 12. Audit Trail & Non-Functional

### 12.1 Audit
| Operasi | Dicatat? | Who | What | When | Before | After | Reason wajib? |
|---|---|---|---|---|---|---|---|
| create | ya | | | | — | snapshot | tidak |
| confirm | ya | | | | state lama | state baru | tidak |
| cancel | ya | | | | | | ya |

### 12.2 Non-functional
| Aspek | Target |
|---|---|
| Latency API (p95) | <mis. < 300 ms untuk list 50 baris> |
| Volume data | <mis. tetap wajar sampai 100k baris> |
| Transaksi DB | <operasi mana yang harus atomic> |
| Concurrency | <strategi locking> |

---

## 13. Rencana Implementasi

> Urutan langkah konkret. Ini yang dipakai sesi Coder untuk menyusun todo list.

1. <langkah>
2. <langkah>
3. <langkah>

**Urutan commit yang disarankan:** <misal: migrasi → entity/service → controller → test → UI>

---

## 14. Acceptance Criteria

```text
AC-00X-01

Given: <kondisi awal yang konkret>
When:  <aksi>
Then:  <hasil yang bisa dibuktikan benar/salah tanpa interpretasi>
```

<Setiap item In Scope minimal punya satu AC. Setiap Business Rule punya AC yang menguji
jalur gagalnya juga, bukan hanya jalur sukses.>

---

## 15. Test Plan

| Level | Yang diuji | Catatan |
|---|---|---|
| Unit | <service/business rule> | |
| Integration | <endpoint + DB> | |
| E2E | <alur user> | |

**Data uji / fixture yang dibutuhkan:** <daftar>

---

## 16. Definition of Done

- [ ] Semua AC di bagian 14 lulus
- [ ] Test unit + integration ditulis dan hijau
- [ ] Permission & record rule terpasang dan teruji (termasuk kasus ditolak)
- [ ] Audit log tercatat sesuai bagian 12.1
- [ ] Error state & validasi sesuai bagian 9 dan 11
- [ ] Lint + typecheck bersih
- [ ] `docs/prd/README.md` diperbarui
- [ ] Bagian "Catatan Coder" di bawah diisi

---

## Open Questions

> Diisi oleh sesi Coder saat menemukan ambiguitas. Jangan menebak — set `status: blocked`.
> Dijawab oleh sesi Mentor langsung di bawah tiap pertanyaan.

| # | Pertanyaan | Diajukan oleh | Jawaban Mentor | Tanggal |
|---|---|---|---|---|
| | | | | |

---

## Catatan Coder

> Diisi oleh sesi Coder setelah implementasi selesai.

**Ringkasan yang dikerjakan:**

**File yang dibuat/diubah:**

**Deviasi dari PRD (kalau ada) + alasannya:**

**Hal yang perlu diputuskan Mentor untuk PRD berikutnya:**

**Cara menjalankan & menguji:**
