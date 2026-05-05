# Logika Harga Konversi dan AHSP

Dokumen ini menjelaskan aturan baku perhitungan harga satuan dalam sistem **Zona Geometry-App** untuk memastikan paritas data antara Database (Supabase) dan Laporan (Excel).

## Prinsip Dasar
Sistem menggunakan pendekatan **Harga Terkonversi** dengan **Koefisien Statik**. Artinya, koefisien yang diambil dari referensi Analisa Harga Satuan Pekerjaan (AHSP) tidak boleh diubah nilainya, sementara harga pasarlah yang disesuaikan agar cocok dengan satuan di dalam analisa tersebut.

---

## 1. Komponen Perhitungan

### A. Harga Toko (Database)
Adalah harga barang sesuai dengan satuan yang dijual di pasar atau toko.
- **Contoh**: 
  - Semen PC: Rp 60.000 / **Sak**
  - Pasir Pasang: Rp 220.000 / **m3**
  - Cat Tembok: Rp 150.000 / **Galon**

### B. Faktor Konversi
Adalah angka pembagi untuk mengubah satuan toko menjadi satuan yang digunakan dalam rumus AHSP. Jika tidak ada konversi, nilai default adalah **1**.
- **Rumus**: `Harga Konversi = Harga Toko / Faktor Konversi`
- **Contoh**:
  - Semen (1 Sak = 40 kg) -> Faktor: **40**
  - Cat (1 Galon = 5 liter) -> Faktor: **5**
  - Semen (Jika AHSP pakai Ton, 1 Ton = 0,001 kg?) -> Faktor: **0,001** (Agar Harga_kg / 0,001 = Harga_Ton)

### C. Koefisien AHSP (Statik)
Koefisien yang tertera dalam katalog AHSP (PUPR/Custom) adalah **STATIK**. Angka ini tidak boleh dikalikan atau dibagi oleh faktor konversi.
- **Contoh**: Koefisien Semen untuk Acian adalah `3.2500` (kg). Angka ini tetap `3.2500`.

---

## 2. Rumus Akhir (Subtotal)

Total harga untuk satu komponen di dalam AHSP dihitung sebagai berikut:

$$Subtotal = Koefisien \times \left( \frac{Harga Toko}{Faktor Konversi} \right)$$

### Contoh Kasus: Pemasangan 1 m2 Acian
1.  **Harga Toko (Semen)**: Rp 60.000 / Sak
2.  **Faktor Konversi**: 40 (Karena 1 Sak = 40 kg)
3.  **Harga Konversi**: $60.000 / 40 = Rp 1.500 / kg$
4.  **Koefisien AHSP**: 3,25 (kg)
5.  **Subtotal**: $3,25 \times 1.500 = Rp 4.875$

---

## 3. Implementasi Teknis

### SQL View (Supabase)
Di dalam database, logika ini diterapkan pada `view_katalog_ahsp_lengkap` dan `view_project_resource_summary`:
```sql
-- Cuplikan Logika SQL
SELECT 
    koefisien AS koefisien_efektif,
    (harga_toko / COALESCE(NULLIF(faktor_konversi, 0), 1)) AS harga_efektif,
    (koefisien * (harga_toko / COALESCE(NULLIF(faktor_konversi, 0), 1))) AS subtotal
FROM ...
```

### Excel Engine (JavaScript)
Pada saat ekspor ke Excel, sistem tidak melakukan penskalaan koefisien otomatis (*heuristic scaling*). Semua angka diambil apa adanya dari database untuk menjaga presisi.
- **File**: `lib/excel_engine.js`
- **Aturan**: Koefisien di kolom G (Excel) harus murni angka koefisien dari analisa tanpa modifikasi.
