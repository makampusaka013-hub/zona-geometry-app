# Sistem Autentikasi & Verifikasi Zona Geometry (v2 - Hardened)

Dokumen ini merangkum arsitektur keamanan dan logika autentikasi yang telah diperkuat untuk mengatasi masalah sinkronisasi domain (www vs non-www) dan kegagalan database (server_error).

## 1. Konsistensi Domain (Canonical WWW)
Untuk mencegah kegagalan **PKCE Code Exchange** (Error: unexpected_failure), seluruh trafik dipaksa menggunakan domain `www`.
- **Middleware:** `middleware.js` mendeteksi jika user mengakses `zonageometry.id` dan segera melakukan redirect 301 ke `www.zonageometry.id`.
- **Benefit:** Menjamin cookie sesi Supabase selalu terbaca dengan benar di `/auth/callback`.

## 2. Alur Pendaftaran & Verifikasi
- **Email/Password:**
  - User mendaftar di `app/register/page.js`.
  - Status awal di database: `pending`.
  - User diarahkan ke `/verify-notice`.
  - Email dikirim via Hostinger SMTP.
- **Google OAuth:**
  - Callback di `app/auth/callback/route.js`.
  - **Sistem Baru:** Mendukung ekstraksi detail error dari Supabase untuk debugging yang lebih mudah.
  - User baru otomatis didaftarkan ke tabel `members` via trigger database.
  - User diarahkan ke `/verify-notice` untuk konsistensi alur verifikasi.

## 3. Arsitektur Database Fail-Safe (Supabase)
Sistem sekarang menggunakan trigger yang "kebal" terhadap error untuk mencegah user terkunci (lockout).

### A. Skema Internal (Security Definer)
Fungsi sensitif dipindahkan ke skema `internal` untuk mematuhi standar Supabase Linter (Advisor) dan menghindari manipulasi `search_path`.
- **Fungsi:** `internal.handle_new_user_sync()`
- **Fitur:** Menggunakan blok `EXCEPTION WHEN OTHERS THEN RETURN NEW;`. Jika terjadi error saat menyimpan data ke tabel `members`, sistem Auth Supabase **tidak akan ikut error**, sehingga user tetap bisa login.

### B. Pembersihan Trigger (Nuclear Cleanup)
Semua trigger lama yang berpotensi bentrok (`on_auth_user_created`, `create_profile_on_signup`, dll) telah dihapus dan digantikan oleh satu trigger tunggal: `tr_on_auth_user_created`.

## 4. Penanganan Error (Next.js 15)
- **Callback Route:** Dioptimasi untuk Next.js 15 dengan `await cookies()` asinkron.
- **Error Passthrough:** Jika terjadi kegagalan (misal: Google Account Issue), detail error dikirim ke halaman login sebagai query parameter `message` dan `error_description`.
- **Friendly UI:** Halaman login menampilkan pesan yang lebih manusiawi untuk `server_error` atau `unexpected_failure`.

## 5. Variabel Lingkungan (Environment Variables)
- `NEXT_PUBLIC_SITE_URL`: `https://www.zonageometry.id` (Wajib dengan www).
- `SUPABASE_SERVICE_ROLE_KEY`: Digunakan di API internal untuk bypass RLS saat aktivasi.
- `ADMIN_EMAIL` & `EMAIL_PASSWORD`: Kredensial SMTP Hostinger.

---
*Terakhir diupdate: 7 Mei 2026 (Hardening Session)*
