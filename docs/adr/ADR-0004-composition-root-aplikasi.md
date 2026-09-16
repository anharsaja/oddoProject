---
id: ADR-0004
title: Composition root — satu fungsi configureApp yang dipakai production dan test, dan dua kanal pendaftaran guard/interceptor
status: accepted
date: 2026-09-16
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-0004 — Composition Root Aplikasi

## Konteks

PRD-000 memunculkan pola yang tidak diminta PRD-nya, tapi terbukti benar saat
implementasi: seluruh wiring aplikasi dipisah ke satu fungsi
`configureApp(app, env)` di `apps/api/src/app.setup.ts`, dan fungsi itu dipanggil
oleh `main.ts` **dan** oleh setiap integration test.

Kenapa ini tidak boleh dibiarkan sebagai kebetulan di satu PRD: PRD-001 memasang
`AuthGuard`, PRD-002 memasang `PermissionGuard` dan `AuditInterceptor`. Kalau cara
memasangnya tidak ditetapkan sekarang, dua kegagalan berikut hampir pasti terjadi:

1. **Guard hanya terpasang di `main.ts`.** Integration test mem-boot aplikasi tanpa
   guard, seluruh test endpoint hijau, dan tidak ada satu pun test yang benar-benar
   menguji bahwa endpoint terlindungi. Ini kegagalan diam — test-nya ada, hijau, dan
   tidak membuktikan apa pun.
2. **Guard dipasang lewat `useGlobalGuards(new AuthGuard())`.** `AuthGuard` butuh
   `SessionService` dan `Reflector` dari container DI. Instance yang dibuat dengan
   `new` tidak punya keduanya, dan ini baru ketahuan saat runtime.

`ADR-0002` §3 sudah menetapkan aturannya: *endpoint tanpa `@RequirePermission` ditolak
saat boot, kecuali ditandai `@Public()`*. Aturan itu hanya bisa ditegakkan kalau
tempat pemasangan guard-nya tunggal dan pasti.

---

## Opsi yang dipertimbangkan

### Opsi A — Wiring langsung di `main.ts` (bawaan dokumentasi NestJS)

- **Cara kerja:** `app.useGlobalPipes(...)`, `app.useGlobalFilters(...)` ditulis di
  `bootstrap()`. Test membuat aplikasinya sendiri lewat `Test.createTestingModule`.
- **Untung:** paling sedikit kode, persis seperti contoh di dokumentasi.
- **Rugi:** test mem-boot aplikasi yang **berbeda** dari production. Filter, pipe, dan
  guard yang tidak ikut ter-copy ke test adalah komponen yang tidak pernah diuji.
  Menyalin wiring ke tiap file test berarti menduplikasinya, dan duplikat itu akan
  ketinggalan zaman pada PRD ketiga.
- **Biaya kalau berubah pikiran nanti:** murah sekarang, mahal nanti — setiap file test
  yang sudah menyalin wiring harus disunting satu per satu.

### Opsi B — Satu `configureApp(app, env)` dipanggil `main.ts` dan setiap test (dipilih)

- **Cara kerja:** semua yang mengubah aplikasi dari "Nest kosong" menjadi *aplikasi ini*
  ada di satu fungsi. `main.ts` memanggilnya; setiap integration test memanggilnya.
- **Untung:** hanya ada satu jawaban untuk "apa yang aktif saat request masuk", dan
  test mem-boot aplikasi yang sama dengan production. Menambah komponen global cukup
  di satu tempat, dan seluruh test langsung ikut melihatnya.
- **Rugi:** satu langkah yang harus diingat di tiap test. Kalau lupa, test-nya mem-boot
  aplikasi telanjang — sama seperti Opsi A, tapi diam-diam.
- **Biaya kalau berubah pikiran nanti:** murah — fungsinya satu, pemanggilnya sedikit.

### Opsi C — Semuanya jadi provider global (`APP_PIPE`, `APP_FILTER`, `APP_GUARD`) di `AppModule`

- **Cara kerja:** komponen global didaftarkan sebagai provider, sehingga ikut terbawa
  ke mana pun `AppModule` di-import, termasuk ke `Test.createTestingModule`.
- **Untung:** otomatis terbawa ke test tanpa langkah tambahan, dan komponennya sadar DI —
  bisa meng-inject service, yang **wajib** untuk `AuthGuard` dan `PermissionGuard`.
- **Rugi:** tidak semua hal bisa diungkapkan sebagai provider. `setGlobalPrefix('api')`,
  `enableCors()`, dan `enableShutdownHooks()` adalah operasi pada objek aplikasi, bukan
  pada module graph. Jadi Opsi C tidak pernah cukup sendirian — selalu tetap butuh
  tempat untuk sisanya.
- **Biaya kalau berubah pikiran nanti:** sedang.

---

## Keputusan

**Kita pilih Opsi B sebagai kerangka, dengan Opsi C dipakai untuk komponen yang
butuh dependency injection.** Keduanya bukan alternatif yang saling meniadakan —
masing-masing menangani hal yang tidak bisa ditangani yang lain.

### Kanal 1 — `configureApp(app, env)` di `apps/api/src/app.setup.ts`

Untuk hal yang merupakan operasi pada objek aplikasi, bukan anggota module graph:

| Yang dipasang di sini | Contoh dari PRD-000 |
|---|---|
| Global prefix | `app.setGlobalPrefix('api')` |
| Pipe global tanpa dependency | `ValidationPipe` dengan `validationExceptionFactory` |
| Filter global tanpa dependency | `AllExceptionsFilter` |
| Interceptor global tanpa dependency | `RequestIdInterceptor` |
| CORS | `app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })` |
| Shutdown hooks | `app.enableShutdownHooks()` |

### Kanal 2 — provider `APP_GUARD` / `APP_INTERCEPTOR` / `APP_FILTER` di module pemiliknya

Untuk komponen yang perlu meng-inject sesuatu:

```ts
// SPESIFIKASI untuk PRD-001 — bukan kode final
@Module({
  providers: [
    SessionService,
    { provide: APP_GUARD, useClass: AuthGuard },   // butuh SessionService + Reflector
  ],
})
export class AuthModule {}
```

Aturan memilih kanal: **butuh DI → Kanal 2. Tidak butuh DI → Kanal 1.**
`AuthGuard` (PRD-001) dan `PermissionGuard` (PRD-002) masuk Kanal 2, didaftarkan di
module pemiliknya, bukan di `app.setup.ts`.

### Aturan yang mengikat kedua kanal

1. **Setiap integration test mem-boot lewat `configureApp`.** Tidak ada test yang
   memanggil `createNestApplication()` lalu langsung `init()`.
2. **Tidak ada komponen global yang dipasang langsung di `main.ts`.** `main.ts` hanya
   boleh berisi: validasi env, pembuatan app, `configureApp`, dan `listen`.
3. **Apa pun yang mengubah perilaku request wajib terlihat oleh test.** Kalau sebuah
   komponen tidak bisa dilihat test lewat salah satu dari dua kanal di atas, komponen
   itu belum selesai dipasang.

---

## Konsekuensi

**Positif**
- "Apa yang aktif saat request masuk?" punya jawaban tunggal yang bisa dibaca dalam
  satu layar: `app.setup.ts` plus daftar provider `APP_*`.
- Test keamanan PRD-001 dan PRD-002 menguji guard yang sungguhan terpasang, bukan
  salinan yang kebetulan mirip.
- `main.ts` tetap tipis selamanya, tidak menumpuk jadi tempat sampah konfigurasi.

**Negatif / harga yang kita bayar**
- Ada dua kanal, jadi ada satu keputusan kecil yang harus diambil tiap kali komponen
  global baru masuk. Aturan "butuh DI → Kanal 2" dibuat supaya keputusan itu mekanis,
  bukan selera.
- Memanggil `configureApp` di tiap test adalah langkah yang bisa terlupa. Gejalanya
  khas: test yang seharusnya 401/403 malah 200.

**Yang jadi wajib mulai sekarang**
1. Komponen global baru didaftarkan lewat salah satu dari dua kanal di atas — tidak
   pernah langsung di `main.ts`.
2. Integration test mem-boot lewat `configureApp(app, env)`.
3. Guard yang menegakkan `ADR-0002` §3 didaftarkan sebagai `APP_GUARD` di module
   pemiliknya, supaya ikut aktif di test tanpa disalin.

## Cara mengecek kepatuhan

| Aturan | Cara mengecek |
|---|---|
| Test memakai wiring yang sama | Pencarian `createNestApplication` di `apps/api/test/**`: setiap kemunculan harus diikuti `configureApp` |
| `main.ts` tetap tipis | Review: `main.ts` tidak boleh memuat `useGlobal*` selain lewat `configureApp` |
| Guard benar-benar aktif di test | PRD-001 wajib punya test "endpoint terproteksi menjawab 401 tanpa session" yang mem-boot lewat `configureApp` |

## Kapan ADR ini perlu ditinjau ulang

- Kalau `apps/api` dipecah jadi lebih dari satu proses (mis. worker antrian terpisah),
  karena saat itu ada lebih dari satu composition root.
- Kalau jumlah komponen global melewati ~8 dan `app.setup.ts` mulai sulit dibaca
  dalam satu layar.
