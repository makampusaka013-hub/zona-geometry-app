PRODUCT REQUIREMENTS DOCUMENT (PRD) v1.0
Project Name: Zona Geometry-App & Monitor (Hybrid Construction Management)
Target Market: Kontraktor, Konsultan Pengawas, & Instansi (PUPR/Pemerintah)
Core Value: Akurasi RAB, Sinkronisasi Lapangan, & Kepatuhan Standar Administrasi (TKDN, MC, CCO).

1. OBJECTIVE & USER ROLES
Aplikasi ini bertujuan untuk mendigitalisasi proses perencanaan (RAB), pelaksanaan (Harian/Mingguan), dan pengawasan (Kurva S/CCO) dalam satu platform hybrid (Web & Mobile).

User Roles & Permissions:
Admin: Kontrol penuh sistem, manajemen user (Aktivasi, Role, & Masa Aktif), dan backup data.

Mode Pro (Kontraktor/Estimator): Membuat RAB, AHSP, Schedule, CCO, dan Laporan. Membutuhkan aktivasi Admin.

Mode Advance (Senior Estimator/Admin Internal): Memiliki akses penuh ke manajemen Katalog Harga (Custom & Override) dan Katalog AHSP (Edit Faktor Konversi & Custom AHSP). Membutuhkan penugasan khusus oleh Admin.

Mode Normal (Pelaksana Lapangan): Input progres volume harian, foto dokumentasi, dan absensi manpower. Akses Katalog bersifat Read-Only.

2. PROJECT METADATA (Informasi Kontrak)
Setiap proyek wajib memiliki data administratif untuk keperluan Header Laporan:

Identitas: Nama Program, Kegiatan, Pekerjaan, Lokasi.

Kontrak: Nomor & Tanggal Kontrak, Nilai Kontrak, Tahun Anggaran, Sumber Dana.

Waktu: Tanggal SPMK (Mulai), Durasi (Hari Kalender), Tanggal PHO (Selesai).

27. Stakeholder: Integrasi penuh (Nama Kontraktor, Konsultan Pengawas, Nama & NIP PPK/PPTK) sebagai data penanda tangan laporan. [IMPLEMENTED]

3. CORE MODULES (TECHNICAL REQUIREMENTS)
A. Database Master & AHSP (Web Desktop)
Master Resource: Database Harga Satuan Upah, Bahan, dan Alat.

TKDN Tracking: Setiap material memiliki kolom persentase (%) TKDN.

AHSP Builder: Rumus analisis (Koefisien x Harga Satuan) untuk membentuk harga per satuan pekerjaan.

HPS vs Penawaran: Fitur pembanding antara pagu anggaran dan harga kontraktor.

B. RAB & Volume Management (Hybrid)
Input Volume: Input angka volume murni (bukan kalkulator dimensi).

Calculation: Total = Volume x Harga AHSP.

Lumpsum Mode: Pilihan untuk input harga total secara manual jika tidak menggunakan AHSP.

C. Execution & Monitoring (Mobile First)
Daily Progress: Input volume realisasi harian.

Manpower Analysis: Fitur hitung (Volume / Koefisien Tenaga) / Jumlah Pekerja untuk prediksi durasi.

Photo Documentation: Kamera wajib Geotagging (GPS) & Timestamp. Foto terikat ke item pekerjaan di RAB.

D. Construction Administration (PUPR Standard)
Mutual Check (MC-0 & MC-100): Tabel perbandingan volume kontrak vs lapangan.

CCO Module: Sistem revisi kontrak (Addendum). Riwayat data sebelum CCO tidak boleh hilang.

Schedule & Kurva S: Grafik otomatis berdasarkan bobot biaya dan durasi waktu.

4. REPORTING SYSTEM
Aplikasi harus mampu mengenerate laporan otomatis dalam format PDF/Excel:

Aplikasi mampu mengenerate laporan otomatis dalam format Excel Profesional:
61. Laporan Harian: Akumulasi volume harian per tanggal terpilih. [IMPLEMENTED]
62. Laporan Mingguan: Akumulasi progres per periode minggu (7 hari). [IMPLEMENTED]
63. Laporan Bulanan: Rekapitulasi progres bulanan (akumulasi harian). [IMPLEMENTED]
64. Export Excel: Format otomatis sesuai standar teknis lapangan. [IMPLEMENTED]

5. HYBRID & SYNC LOGIC
Offline Mode (Mobile): User lapangan bisa simpan data progres di lokal saat tidak ada sinyal.

Auto-Sync: Data otomatis terunggah ke Cloud saat terdeteksi koneksi internet.

Push Notification: Notifikasi ke Desktop jika ada laporan baru dari Mobile untuk di-approve.

6. BUSINESS LOGIC (MEMBERSHIP & PAYWALL)
Untuk membatasi penggunaan gratis dan mengaktifkan sistem berbayar:

Free Tier: Maksimal 1 Proyek aktif, maksimal 3 User (Member), fitur CCO & Export PDF terkunci.

Pro Tier: Unlimited Proyek, Unlimited User, akses penuh semua modul laporan.

8. ACCOUNT ACCESS & SECURITY ENFORCEMENT
Untuk menjaga keamanan dan validitas data pengguna:

Activation Flow: User baru berstatus 'Pending'. Dashboard hanya bisa diakses setelah Admin mengubah status menjadi 'Active'.

Automated Block: User dengan status 'Pending' atau 'Suspended' akan otomatis dialihkan kembali ke halaman login (Access Enforcement).

Admin Bypass: Role Admin selalu berstatus aktif dan melewati semua pengecekan aktivasi untuk mencegah penguncian sistem (Lock-out).

Security Layers: Proteksi data di tingkat database menggunakan RLS (Row Level Security) yang terintegrasi dengan status aktivasi user.

7. TECHNICAL STACK (RECOMMENDED FOR AI CODING)
Frontend: Next.js (Web/Desktop) & Flutter (Mobile).

Backend/Database: Supabase (PostgreSQL) untuk Auth, Real-time DB, dan Storage.

Infrastructure: Cloud-based (AWS/Google Cloud).

Instruksi untuk AI (Prompt Awal):
"Gunakan PRD di atas sebagai panduan utama. Mulailah dengan membuat struktur database di Supabase yang mencakup tabel workspaces, projects, project_details, dan members. Pastikan sistem autentikasi mendukung pembagian Role (Admin, Pro, Normal, View) dan setiap data terkunci pada project_id masing-masing."