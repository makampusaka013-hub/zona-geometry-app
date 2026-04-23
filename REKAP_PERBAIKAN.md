# Rekap Perbaikan: Sistem Pembayaran Midtrans (Upgrade Plan)

Dokumen ini merangkum perbaikan yang dilakukan untuk mengatasi masalah halaman "Upgrade Plan" yang macet, error 401 (Unauthorized), dan pesan "Transaksi tidak ditemukan".

## 1. Masalah Utama
- **Status Loading Macet**: Tombol upgrade tidak bisa diklik ulang setelah terjadi error karena status loading tidak di-reset.
- **Error 401 (Unauthorized)**: Midtrans menolak API Key karena ketidakcocokan antara Mode (Sandbox/Production) dengan kunci yang digunakan.
- **Transaksi Tidak Ditemukan**: Popup Midtrans gagal memuat data karena ketidaksinkronan antara backend (Sandbox) dan frontend (Production).

## 2. Solusi Teknis (Backend)
- **Logika Inisialisasi Baru**: Menghapus deteksi otomatis berdasarkan awalan kunci (`Mid-server-`) karena akun tertentu memiliki pola kunci yang berbeda antara Dashboard dan API.
- **Manual Mode Control**: Menggunakan variabel lingkungan `MIDTRANS_IS_PRODUCTION` untuk menentukan mode secara absolut.
- **Optimasi Order ID**: Mengubah format ID transaksi menjadi `PREFIX-UUIDSHORT-TIMESTAMP` agar selalu unik, aman (dibawah 50 karakter), dan informatif.
- **Standardisasi**: Menyeragamkan inisialisasi `Snap` dan `CoreApi` di seluruh API routes (`/api/payment/create-token` dan `/api/payment/verify`).

## 3. Solusi Teknis (Frontend)
- **Sinkronisasi Script**: Menggunakan `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` untuk menentukan apakah browser harus memuat `snap.js` versi Production atau Sandbox.
- **Robust Error Handling**: Menambahkan blok `finally` atau penanganan error di `handleUpgrade` untuk memastikan `setLoading(false)` terpanggil dalam kondisi apapun (gagal bayar, ditutup, atau error server).

## 4. Konfigurasi Lingkungan (Environment Variables)
Perbaikan ini membutuhkan variabel berikut di `.env.local` dan juga di **Vercel Settings**:

| Variable | Value (Testing) | Value (Production) |
| :--- | :--- | :--- |
| `MIDTRANS_IS_PRODUCTION` | `false` | `true` |
| `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` | `false` | `true` |
| `MIDTRANS_SERVER_KEY` | Kunci Sandbox | Kunci Production |
| `MIDTRANS_CLIENT_KEY` | Kunci Sandbox | Kunci Production |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Kunci Sandbox | Kunci Production |

## 5. Instruksi Deployment
Setiap kali ada perubahan pada variabel lingkungan di Vercel:
1. Simpan perubahan di Dashboard Vercel.
2. Lakukan **Redeploy** pada deployment terbaru.
3. Pastikan kode terbaru sudah di-push ke GitHub.


---

# Rekap Perbaikan: Hardening Keamanan Supabase (RLS & Audit)

Riwayat perbaikan untuk mengatasi peringatan *Supabase Security Advisor* dan memperkuat infrastruktur basis data.

## 1. Masalah yang Diselesaikan
- **Multiple Permissive Policies**: Menghapus kebijakan RLS yang bertumpang tindih (misalnya: varian nama lama, kebijakan Admin `FOR ALL` yang bertabrakan dengan `FOR SELECT` user).
- **Auth RLS Initialization Plan**: Mengoptimalkan kebijakan yang menggunakan `auth.uid()` dengan mengubahnya menjadi `(SELECT auth.uid())` untuk performa lebih baik.
- **Missing Foreign Keys & RLS**: Mengaktifkan RLS pada tabel-tabel baru (seperti `support_tickets`, `analysis`, dll) dan menambahkan constraint `FOREIGN KEY` yang hilang.

## 2. Solusi Teknis (Definitive Migration)
Dibuat satu file migrasi final yang bersifat **idempotent** (aman dijalankan berulang kali):
- **File**: `20260420200000_definitive_policy_cleanup.sql`
- **Tindakan**:
    1. Melakukan `DROP POLICY IF EXISTS` pada semua varian nama kebijakan lama (v1, v2, vFinal, manage, dll) di 12+ tabel utama.
    2. Memisahkan kebijakan `FOR ALL` menjadi operasi spesifik (`INSERT`, `UPDATE`, `DELETE`) untuk menghindari peringatan performa.
    3. Menggabungkan kebijakan Akses User dan Admin menjadi satu kebijakan terintegrasi per operasi.

## 3. Daftar Tabel yang Diperkuat
- `active_sessions`, `daily_reports`, `daily_progress`, `project_photos`, `project_revisions`, `project_items`, `manpower_analysis`, `support_tickets`, `master_ahsp`, `master_ahsp_details`, `master_harga_dasar`.

## 4. Instruksi Manual (PENTING)
Beberapa tindakan keamanan TIDAK bisa dilakukan via SQL dan harus dilakukan secara manual oleh owner di Dashboard Supabase:
1. **Leaked Password Protection**:
    - Buka Dashboard Supabase → Authentication → Settings.
    - Scroll ke bagian **"Password Protection"**.
    - Aktifkan toggle **"Leaked Password Protection"**.
2. **Eksekusi SQL**:
    - Pastikan hanya menjalankan file migrasi terbaru (`20260420200000_definitive_policy_cleanup.sql`) untuk memastikan basis data bersih dari kebijakan lama yang redundant.


---

# Rekap Perbaikan: Optimasi Performa & Struktur Index (Final)

Penyelesaian audit database dengan mengutamakan standar keamanan industri (Structural Hardening) untuk menghentikan siklus saran kontradiktif dari Advisor.

## 1. Masalah yang Diselesaikan
- **Unindexed Foreign Keys (Critical)**: Memasang kembali index pada seluruh kolom kunci tamu (FK) yang dilaporkan kurang, guna menjamin integritas relasional dan performa penghapusan data.
- **Identical & Redundant Cleanup**: Menghapus index kembar dan penumpukan index di `project_members` yang terbukti membebani database.
- **Structural Integrity over False Positives**: Mengabaikan peringatan "Unused Index" pada tabel dengan data sedikit demi mempertahankan index FK yang secara struktural wajib ada.

## 2. Solusi Teknis (Final Hardened State)
Dibuat file migrasi tunggal yang mencakup seluruh audit:
- **File**: `20260420210000_add_missing_performance_indexes.sql`
- **Daftar Index FK yang Dipertahankan**:
    - `members(location)`, `projects(location)`, `daily_progress(report)`, `project_photos(report)`, `manpower(item)`, `ahsp(ahsp_id)`, `tickets(user)`, `revisions(approved)`.
- **Tindakan Pembersihan**:
    - Menghapus redundansi Primary Key di `project_members`.
    - Menghapus index identik/duplikat penamaan di tabel master.

## 3. Kesimpulan Akhir
- **Status Dashboard**: Peringatan **"Unindexed Foreign Keys"** dan **"Identical Indexes"** telah **tuntas 100%**.
- **Catatan**: Daftar "Unused Index" mungkin akan tetap menampilkan index FK tersebut selama volume data masih sedikit. Hal ini adalah **normal dan benar** secara arsitektur database untuk menjamin keamanan jangka panjang.

---

# Rekap Perbaikan: AHSP Search Connectivity & UI Refinement (23 April 2026)

Penyelesaian masalah pencarian AHSP yang terputus dari database dan optimalisasi UX pada modul RAB Editor.

## 1. Masalah yang Diselesaikan
- **Search Connectivity Loss**: Pencarian kode AHSP (misal: "1.1.1.1") tidak memunculkan hasil dari database pusat.
- **PPN 0% Unsaveable**: Ketidakmampuan menyimpan nilai PPN 0% karena logika default Javascript yang memaksa kembali ke 12%.
- **Missing Sub-Tab UI**: Sub-tab "RAB Pekerjaan" menghilang atau terkunci bagi beberapa user role, menyisakan hanya tab Backup dan Jadwal.
- **Manual Start Date Entry**: Kebutuhan untuk pengisian otomatis tanggal mulai proyek agar mempermudah alur kerja penjadwalan.

## 2. Solusi Teknis & UI/UX
- **Unified AHSP Search**: Mengalihkan target pencarian ke `view_analisa_ahsp`. Hal ini memastikan sinkronisasi 100% dengan database katalog resmi dan custom.
- **Result Hover Enhancement**: Menambahkan atribut `title` pada elemen hasil pencarian. Sekarang user dapat melihat nama uraian pekerjaan secara lengkap hanya dengan mengarahkan kursor (hover).
- **Nullish Coalescing for PPN**: Mengganti operator `||` dengan `??` pada logika pemuatan data. Ini memungkinkan angka `0` diproses sebagai nilai valid, bukan sebagai "null/kosong".
- **Access Policy Liberalization**: Menghapus kondisi restriktif pada tab navigasi. Tab "RAB Pekerjaan" kini bersifat universal bagi seluruh personil yang memiliki akses ke proyek tersebut.
- **Auto-Initialization logic**: Menambahkan logika `new Date().toISOString()` pada form pembuatan proyek baru untuk mengisi otomatis `start_date`.

---
*Dibuat oleh Antigravity untuk Zona Geometry-App - 23 April 2026 (15:35)*
