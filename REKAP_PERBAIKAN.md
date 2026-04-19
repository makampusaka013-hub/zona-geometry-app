# Rekap Perbaikan Kolaborasi Proyek - BuildCalc
Tanggal: 2026-04-14

Dokumen ini merangkum perbaikan dan fitur baru yang telah diimplementasikan pada modul Kolaborasi Proyek di aplikasi BuildCalc.

## 1. Perbaikan Bug (Bug Fixes)
- **Status "PENDING"**: Memperbaiki masalah di mana status personil tetap "PENDING" meskipun peran sudah ditetapkan oleh pemilik proyek.
- **Join Logic**: Sinkronisasi parameter RPC `join_project_by_code` dari `p_unique_code` menjadi `p_code` agar sesuai dengan skema database.
- **State Sync & Flicker**: Mengatasi masalah tampilan kosong ("Memuat Data...") yang muncul sejenak setelah melakukan aksi di dalam modal. Data sekarang diperbarui secara instan tanpa menutup modal.
- **Sintaks JS**: Memperbaiki error build (`Expected '}', got '<eof>'`) akibat kesalahan penempatan hook dan kurung kurawal pada file `page.js`.

## 2. Peningkatan Fitur & UI/UX
- **Redefinisi Reset**: Tombol "Reset" pada slot peran kini hanya akan mengosongkan peran (menjadikan status PENDING kembali) tanpa mengeluarkan member dari proyek.
- **Self-Reset (Keluar Role)**: Mengizinkan pemegang peran (termasuk Owner) untuk mereset slot mereka sendiri jika ingin "keluar" dari tanggung jawab peran tersebut.
- **Hapus Member**: Menambahkan tombol sampah (Trash icon) pada daftar personil terdaftar agar Owner dapat mengeluarkan member dari proyek secara permanen.
- **Labeling**: Mengubah label tombol "Hapus / Reset" menjadi "Reset" agar lebih intuitif.

## 3. Pembaruan Database (Supabase RPC)
- **`remove_project_member`**: Fungsi baru untuk mengeluarkan anggota dari proyek secara aman (Security Definer).
- **`reset_project_slot`**: Update logika untuk mengubah `slot_role` menjadi `NULL` alih-alih menghapus baris keanggotaan.
- **`assign_project_slot`**: Optimasi pembaruan field `can_write` berdasarkan peran yang dipilih.

## 4. Keamanan & RLS
- Stabilisasi RLS `project_members_select_v3` untuk memastikan visibilitas profil member bagi sesama anggota tim dan pemilik proyek tanpa terjadi error rekursi.

## 5. Konsolidasi Alur Kerja Proyek (Baru)
- **Modal Identitas Terpisah**: Memisahkan alur **"Buat Identitas Proyek"** (selalu kosong) dan **"Edit Identitas Proyek"** (isi data terpilih) untuk menghindari kontaminasi data.
- **Validasi Terpadu**: Sinkronisasi `RabEditorTab` agar "Nama Proyek" dianggap sebagai input sah untuk membuat RAB (menghilangkan error "setidaknya salah satu...").
- **Penanda Kolom Wajib**: Menambahkan tanda bintang merah (`*`) dan atribut `required` pada kolom krusial (Nama, Tahun, Pagu).
- **Konfirmasi Modern**: Mengganti `confirm()` browser dengan **Modal Konfirmasi Premium** (Glassmorphism & Rose theme) untuk tindakan destruktif (Hapus Proyek).
- **Akses Cepat**: Penambahan tombol "+ Proyek Baru" langsung di Header Utama Dashboard.
- **Perbaikan Visibilitas**: Memastikan baris sub-tab (RAB Pekerjaan / Jadwal) tetap muncul meskipun dalam mode draf (Proyek Baru).
- **Pembersihan UI**: Menghapus duplikasi tombol "INFO PROYEK" dan menyatukannya di sub-header.
- **Penyelarasan Istilah**:
    - "DESKRIPSI / RINCIAN" → **"Uraian"**
    - "Lokasi Proyek" → **"Tab Proyek"**

### Tanggal: 2026-04-15 (Restorasi & Keamanan Kritis)

#### 1. Pemulihan Infrastruktur Database
- **Restorasi View Gabungan**: Memulihkan `view_katalog_ahsp_gabungan` dan `view_analisa_ahsp` yang terhapus akibat efek `CASCADE` pada migrasi sebelumnya. Katalog AHSP kini kembali normal menampilkan data Gabungan (Official + Custom).
- **Fix Sync Deadlock**: Menyelesaikan masalah sinkronisasi CLI Supabase dengan:
    - Resolusi konflik nomor versi duplikat pada file migrasi.
    - Sinkronisasi massal riwayat migrasi (`repair --status applied`).
    - Penambahan kolom `is_lengkap` yang tertinggal pada skema remote.

#### 2. Penguatan Keamanan (Security Hardening)
- **Mass Security Invoker (Views)**: Mengubah seluruh View publik (10+ views) dari mode `SECURITY DEFINER` menjadi `WITH (security_invoker = true)`.
- **RPC Search Path Hardening**: Menetapkan `SET search_path = public` pada seluruh fungsi `SECURITY DEFINER` (termasuk `generate_project_code`, `save_project_transactional`, dan `get_all_users_admin`).
- **Dampak Keamanan**: Menghilangkan peringatan "Critical Security Issue" dari dashboard Supabase dan mencegah eksploitasi search path hijacking.

#### 3. Reporting & Stakeholder Integration (Implementasi Baru)
- **Mesin Pelaporan (Reporting Engine)**: Implementasi utilitas `lib/reporting.js` untuk agregasi otomatis data progres harian menjadi laporan Harian, Mingguan, dan Bulanan dalam format Excel profesional.
- **Manajemen Stakeholder**: Penambahan field (PPK, PPTK, Konsultan, Kontraktor) pada tabel `projects` dan UI Modal Identitas. Data ini digunakan sebagai penanda tangan (signatures) otomatis pada seluruh laporan.
- **Sidebar Highlighting**: Memperbaiki masalah menu aktif di sidebar yang tidak menyala orange saat membuka tab proyek (karena parameter query). Menggunakan logika `startsWith` untuk deteksi navigasi yang lebih cerdas.
- **Account Expiry Info**: Menambahkan rincian masa aktif akun pada halaman profil (`/dashboard/profile`) dengan indikator warna (merah jika expired).
- **Resolusi Build Errors**: Memperbaiki serangkaian kesalahan sintaksis (mismatched divs, trailing characters, state missing) yang terjadi selama penggabungan modul laporan besar.

---
**Catatan**: Seluruh perubahan telah diterapkan pada file `app/dashboard/rekap-proyek/page.js`, `components/tabs/ExportImportTab.jsx`, `components/Sidebar.jsx`, dan `app/dashboard/profile/page.js`.
