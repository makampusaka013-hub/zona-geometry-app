# Product Requirements Document (PRD) - Data Management Updater
**Sistem Sinkronisasi & Konversi AHSP - BuildCalc App**
*Terakhir Diperbarui: 5 April 2026*

Dokumen ini berisi rangkuman teknis dari seluruh pembaruan sistem yang telah diselesaikan untuk melengkapi dan menyempurnakan fitur Upload Data AHSP & Konversinya.

---

## 1. Database Schema (PostgreSQL)

Fitur pengolahan Konversi Harga telah ditanamkan fungsionalitasnya langsung pada fondasi tabel dan _views_:

**A. Skema Tabel:**
- **`master_konversi`**: 
  - Ditambahkan kolom `kode_item_dasar` (TEXT) dan `faktor_konversi` (NUMERIC, Default 1).
  - Bug Constraint PostgreSQL (Duplikasi `NULL`) diperbaiki: Kolom `satuan_ahsp` yang tadinya kosong kini distandardisasi menjadi karakter hubung `'-'` untuk memastikan fungsi `UNIQUE(uraian_ahsp, satuan_ahsp)` & UPSERT bekerja akurat.
- **`master_ahsp_details`**:
  - Kolom `satuan_uraian` kosong juga diotomatiskan menjadi `'-'`.
  - Ditambahkan struktur kolom pendukung baru: `faktor_konversi` (NUMERIC, Default 1) sebagai rekor *offline* data CSV awal.

**B. SQL Views (`view_analisa_ahsp`, `view_debug_analisa`, `view_konversi_harga`):**
- Di-refactor ulang (di-drop dan di-recreate) untuk menarik relasi `faktor_konversi` dari `master_konversi`. 
- Menetapkan **rumus Harga Terkonversi secara baku menjadi pembagian (`/`)**: 
  `Harga Dasar (MHD) / Faktor Konversi`.

---

## 2. API & Stored Procedures (RPC Supabase)

**A. Fungsi `upload_ahsp_csv`:**
- Logika inputnya dimodifikasi menyerap `kode_item_dasar` dan `faktor_konversi` secara *batch*.
- **Logika UPSERT Cerdas**: `ON CONFLICT (uraian_ahsp, satuan_ahsp)` memaksakan PostgreSQL melakukan Replace (`UPDATE`) ke `kode_item_dasar` dan `faktor_konversi` JIKA kolom satuan dan uraian persis sama. Jika tabel CSV mengosongi nilai Konversinya, sistem secara tangguh menyimpan nilai fundamental `1`.
- Skema *bypass* NULL diimplementasikan melalui konstruksi `coalesce(nullif(..., ''), '-')`.

**B. Fungsi `sync_master_konversi`:**
- Sebagai pendorong *Auto-Linker*: Mencari `kode_item_dasar` string yang berkeliaran di `master_konversi`, mengecek kecocokannya dengan `kode_item` milik `master_harga_dasar`, kemudian menyuntikkan (relasi UUID) `id`-nya ke `item_dasar_id` secara masif (bulk update).

---

## 3. Frontend & User Interface (Next.js)

**A. Upload Module (`app/admin/upload-data/page.js`):**
- **Sistem Pembaca CSV Cerdas**: Membuang sistem interupsi _Tab Validation_. Sistem kini bebas membaca _header_ apa pun ("Harga Dasar" maupun "AHSP") sebelum memblokir unggahan.
- **Toleransi Pemetaan Kolom**: Parser disempurnakan untuk maklum terhadap selisih penulisan _header_. Contoh: `kode_item_dasar`, `kode_item`, atau `id_barang` ditangkap untuk UUID; demikian pula dengan `konversi`, `faktor_konversi`, atau `faktor`.
- **Eksekusi Sekuensial & Alert**: Algoritma asinkron dipoles: Seusai sukses membuang _chunk_ basis barisan AHSP ke Database via RPC, `handleSyncKonversi()` akan aktif dipanggil menyusul. Setelahnya disusul pop-up JavaScript: `alert("Berhasil mengupload file AHSP CSV dan menyinkronkan data konversi!")`.

**B. Conversion Dashboard (`app/admin/konversi/page.js`):**
- **Server-Side Rendered Combobox (Bypass Limits)**: Permintaan relasi harga yang lebih dari `1000 items` kini di-_fetching_ secara _server-side filter_ (`.ilike()`). Hanya entitas yang diketik pengguna yang direndangkan pada layar daftar jatuhnya.
- **Real-Time Display**: Menyisipkan preview langsung hasil kalkulator: `Rp [Harga Dasar] / [Faktor Konversi] / [Satuan]`. 
- **Bug Fallback**: Menyematkan nilai pelindung `|| ''` secara meluas di atas properti kontrol React untuk menetralisir _warning browser_ (`Controlled vs Uncontrolled Inputs`). 

---
*Catatan Perawatan: Dokumen Migrasi Supabase yang telah mengakomodasi seluruh rancang bangun arsitektur di atas terletak di direktori lokal `supabase/migrations/20260409140000_update_konversi_logic.sql`, `20260409150000_fix_konversi_nulls.sql` dan `20260409160000_ahsp_detail_konv.sql`.*

**Update Terbaru (Opsi 2: Implementasi 3 Tabel Sekaligus & Auto-Linker):**
- Mengakomodasi permintaan untuk memastikan fungsi berjalan "seperti pertama kali", fungsi `upload_ahsp_csv` kini dibangun ulang di file **`20260409180000_upload_ahsp_rpc_3tables.sql`**.
- **Logika Sub-Query (Cross-check UUID)**: *Insert CTE* untuk tabel `master_konversi` tidak hanya menyimpan *string* `kode_item_dasar`, tetapi langsung memicu `(SELECT id FROM public.master_harga_dasar WHERE kode_item = k_item LIMIT 1)` pada saat _runtime_ di database. Pendekatan ini membuat UUID terserap instan (menyetel `item_dasar_id` secara _real-time_) tanpa harus menunggu _job_ sinkronisasi berjalan secara terpisah. Perekaman data dipastikan menembak 3 tabel utama: `master_ahsp`, `master_ahsp_details`, dan `master_konversi` secara masif dalam 1 prosedur yang solid (*Bulletproof*).
