---
id: ADR-0005
title: Konfigurasi environment, logging, dan lingkungan test — satu .env di root, gerbang validasi terpisah, dan database test yang terpisah permanen
status: accepted
date: 2026-09-16
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-0005 — Konfigurasi Environment & Lingkungan Test

## Konteks

`ADR-0001` B7 menetapkan integration test memakai Postgres sungguhan, dan poin
"yang jadi wajib" nomor 5 menetapkan semua rahasia lewat env var yang divalidasi saat
boot. Keduanya menimbulkan pertanyaan operasional yang tidak dijawab ADR mana pun:
env var dibaca dari file mana, siapa yang memvalidasinya, dan bagaimana test dipastikan
tidak menulis ke database development.

PRD-000 menjawab ketiganya saat implementasi, dua di antaranya sebagai deviasi dari
PRD (D-1 dan D-2). Deviasi itu terbukti benar, dan keduanya akan diwarisi setiap PRD
berikutnya — PRD-001 menambah `SESSION_SECRET` dan `SESSION_TTL`, PRD-002 menambah lagi.
Karena itu polanya diresmikan di sini, bukan ditinggal sebagai catatan di PRD yang
sudah berstatus `done`.

Yang mendorong D-1 khususnya: PRD-000 menulis `.env.test` "sama dengan `.env.example`
kecuali `DATABASE_URL` dan `REDIS_URL`". Diturut harfiah, `NODE_ENV` bernilai
`development` saat test berjalan — lingkungan test yang berbohong tentang dirinya
sendiri, dan pada PRD-000 efek nyatanya adalah transport `pino-pretty` menyala di
dalam test.

---

## Opsi yang dipertimbangkan

### Opsi A — Satu file env per aplikasi (`apps/api/.env`, `apps/web/.env`)

- **Cara kerja:** tiap aplikasi membaca file di foldernya sendiri, cara bawaan Next.js
  dan NestJS.
- **Untung:** tidak perlu konfigurasi tambahan; tiap aplikasi berdiri sendiri.
- **Rugi:** nilai yang dipakai dua sisi (`NEXT_PUBLIC_API_URL` di web vs `PORT` di api)
  ditulis dua kali dan akan berbeda cepat atau lambat. Developer baru harus menyalin dua
  file dan pasti lupa salah satu. Prisma CLI butuh file ketiga lagi.
- **Biaya kalau berubah pikiran nanti:** sedang.

### Opsi B — Satu `.env` di root repo, dimuat eksplisit oleh semua konsumen (dipilih)

- **Cara kerja:** satu file di root; `apps/api` memuatnya lewat `dotenv`, `apps/web`
  lewat `next.config.ts`, Prisma CLI lewat `dotenv-cli`.
- **Untung:** satu sumber kebenaran, satu langkah setup (salin `.env.example`), dan nilai
  lintas-aplikasi mustahil berbeda.
- **Rugi:** tiap konsumen butuh satu baris kode untuk menunjuk ke root — tiga baris di
  tiga tempat. Next.js kehilangan pemuatan otomatisnya.
- **Biaya kalau berubah pikiran nanti:** murah.

### Opsi C — Tanpa file, semua lewat variable shell atau Docker env

- **Untung:** paling dekat dengan cara production berjalan.
- **Rugi:** developer harus menyetel belasan variable sebelum `pnpm dev` pertama.
  Onboarding yang seharusnya tiga perintah jadi satu halaman instruksi.
- **Biaya kalau berubah pikiran nanti:** murah, tapi biayanya dibayar setiap hari.

---

## Keputusan

**Opsi B**, dengan lima aturan turunan berikut.

### 1. File env yang ada, dan mana yang di-commit

| File | Di-commit? | Isi |
|---|---|---|
| `.env.example` | ya | Template lengkap, semua variable, nilai development yang aman |
| `.env.test` | ya | Lingkungan integration test. Bukan rahasia — isinya menunjuk ke container lokal |
| `.env` | **tidak** | File nyata milik developer, ada di `.gitignore` |

Tidak ada `.env.development`, `.env.production`, atau `.env.local`. Production
menyuntikkan env var lewat mekanisme platform-nya, bukan lewat file di repo.

### 2. Validasi env adalah gerbang boot, bukan saran

Seluruh variable divalidasi dengan `zod` **sebelum** Nest membangun apa pun
(`apps/api/src/config/env.schema.ts` dan `env.ts`). Tidak ada variable yang punya
default: default adalah tebakan diam, dan tebakan diam tentang `DATABASE_URL` adalah
cara sebuah test berakhir menulis ke database development.

Gagal validasi berarti: cetak daftar variable bermasalah beserta alasannya, lalu keluar
dengan exit code 1. Tidak ada port yang dibuka.

### 3. Script yang tidak pernah exit butuh gerbang env terpisah (D-2)

`nest start --watch` tidak pernah keluar ketika aplikasinya mati — itu memang sifat
watcher. Akibatnya environment yang tidak valid akan mencetak error lalu menggantung
selamanya, bukan gagal.

Karena itu script `dev` menjalankan gerbang env sebagai proses tersendiri lebih dulu:

```
"dev": "run-s check:env dev:watch"
```

**Aturan ini mengikat semua script berikutnya:** setiap script yang membungkus proses
watch atau daemon dan perlu gagal saat konfigurasinya salah wajib menaruh pemeriksaan
sebagai langkah terpisah di depan, bukan mengandalkan proses watch-nya untuk exit.

### 4. Lingkungan test terpisah permanen dari development (D-1)

| Aspek | Development | Test |
|---|---|---|
| `NODE_ENV` | `development` | **`test`** |
| Database | `oddo_dev` | **`oddo_test`** |
| Redis | index `/0` | **index `/1`** |
| `LOG_LEVEL` | `debug` | **`warn`** |

`NODE_ENV=test` bukan kosmetik: di PRD-000 nilai itulah yang menentukan transport
`pino-pretty` menyala atau tidak. Lingkungan test yang menyebut dirinya `development`
akan terus menghasilkan perbedaan perilaku semacam ini, satu per satu, tanpa pola.

`LOG_LEVEL=warn` di test adalah koreksi atas PRD-000 yang menetapkan `debug`: dengan
`debug`, setiap request di integration test mencetak satu objek JSON penuh dan ringkasan
hasil test tenggelam di antaranya. Level `warn` tetap memunculkan apa pun yang benar-benar
salah.

`.env.test` dimuat dengan `override: true`. Alasannya spesifik: kalau developer kebetulan
punya `DATABASE_URL` ter-export di shell-nya, pemuatan tanpa override akan diam-diam
mengarahkan seluruh test ke database development.

### 5. Logging terpasang di bawah global prefix

Middleware logger NestJS mewarisi global prefix, sehingga baris log terbit untuk
`/api/**` — yaitu seluruh permukaan yang benar-benar dilayani aplikasi ini. Request ke
`/` atau `/favicon.ico` tidak menghasilkan baris log, dan **itu diterima**: keduanya
bukan bagian dari API.

Konsekuensinya mengikat: kalau suatu saat ada route di luar `/api` (misalnya `/metrics`
atau `/healthz` untuk load balancer), PRD yang menambahkannya **wajib** memasang logger
untuk route itu secara eksplisit dan menyebutkannya di bagian 12 PRD-nya.

---

## Konsekuensi

**Positif**
- Setup dari nol tetap satu perintah salin file, berapa pun jumlah aplikasi di monorepo.
- `pnpm test` mustahil menyentuh data development — dijamin oleh dua database terpisah
  plus `override: true`, bukan oleh kehati-hatian.
- Salah konfigurasi selalu muncul sebagai daftar variable yang bisa dibaca, bukan sebagai
  stack trace Prisma atau ioredis.

**Negatif / harga yang kita bayar**
- Setiap konsumen env baru harus diberi tahu letak file root secara eksplisit.
- Menambah satu env var berarti menyentuh tiga file sekaligus (lihat aturan wajib).
- `LOG_LEVEL=warn` di test berarti men-debug test yang rewel butuh menaikkan level
  sementara secara manual.

**Yang jadi wajib mulai sekarang**
1. Variable env baru ditambahkan ke **tiga** tempat dalam satu perubahan yang sama:
   `envSchema`, `.env.example`, dan `.env.test`. PRD yang menambah env var wajib menyebut
   ketiganya di rencana implementasinya.
2. Tidak ada variable env yang punya nilai default di dalam kode.
3. Integration test memakai `oddo_test` dan Redis index `/1`. Tidak ada test yang membaca
   `.env`.
4. Test tidak pernah mematikan container untuk mensimulasikan dependency mati — arahkan
   URL-nya ke port yang tidak didengarkan siapa pun.

## Cara mengecek kepatuhan

| Aturan | Cara mengecek |
|---|---|
| Tidak ada default tersembunyi | Review `env.schema.ts`: tidak boleh ada pemanggilan `.default(...)` |
| Test tidak menyentuh `oddo_dev` | Hash isi `oddo_dev` sebelum dan sesudah `pnpm test` — harus identik (AC-000-12) |
| Env var lengkap di tiga tempat | Boot gagal kalau `.env.example` disalin apa adanya tapi `envSchema` meminta variable yang tidak ada di sana |
| Gerbang env bekerja | Jalankan script `dev` dengan satu variable dirusak — harus exit bukan 0 dalam < 5 detik |

## Kapan ADR ini perlu ditinjau ulang

- Kalau test mulai dijalankan paralel antar-file (`--runInBand` dilepas), karena saat itu
  satu database test bersama tidak lagi cukup — perlu schema per worker.
- Kalau CI masuk (V1), karena CI menyuntikkan env var lewat secret store, bukan file.
- Kalau jumlah env var melewati ~20 dan `.env.example` mulai perlu dikelompokkan per modul.
