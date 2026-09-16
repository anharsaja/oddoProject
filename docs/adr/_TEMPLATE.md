---
id: ADR-000X
title: <keputusan yang diambil, ditulis sebagai pernyataan>
status: proposed         # proposed | accepted | superseded | deprecated
date: YYYY-MM-DD
deciders: [owner, mentor]
supersedes: []
superseded_by: []
---

# ADR-000X — <Judul>

## Konteks

<Situasi yang memaksa keputusan ini diambil. Apa yang sedang kita bangun,
batasan apa yang berlaku (waktu, skill, biaya, stack yang sudah dipilih),
dan kenapa keputusan ini tidak bisa ditunda.>

## Opsi yang dipertimbangkan

### Opsi A — <nama>
- **Cara kerja:** <ringkas>
- **Untung:** <poin>
- **Rugi:** <poin>
- **Biaya kalau berubah pikiran nanti:** <murah / sedang / mahal + kenapa>

### Opsi B — <nama>
- **Cara kerja:**
- **Untung:**
- **Rugi:**
- **Biaya kalau berubah pikiran nanti:**

### Opsi C — <nama>
<sama>

## Keputusan

**Kita pilih: Opsi <X>.**

Alasan:
1. <alasan yang mengacu ke konteks di atas, bukan ke selera>

## Konsekuensi

**Positif**
- <yang jadi lebih mudah>

**Negatif / harga yang kita bayar**
- <yang jadi lebih sulit, dan kapan itu akan terasa>

**Yang jadi wajib mulai sekarang**
- <aturan konkret yang mengikat semua PRD berikutnya>

## Cara mengecek kepatuhan

<Bagaimana kita tahu kode benar-benar mengikuti ADR ini: lint rule, test,
struktur folder, review checklist.>

## Kapan ADR ini perlu ditinjau ulang

<Pemicu konkret, mis. "kalau jumlah company aktif > 5" atau "kalau modul ke-6 masuk".>
