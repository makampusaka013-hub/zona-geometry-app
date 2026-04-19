Temuan

Penyimpanan proyek belum atomic dan bisa menghapus data item lama saat save edit gagal di tengah jalan. Di flow edit, header proyek diupdate lalu semua ahsp_lines langsung dihapus sebelum insert ulang berjalan; kalau insert ulang gagal, proyek tersisa tanpa detail baris. Ini ada di app/dashboard/new-project/page.js#L485 sampai app/dashboard/new-project/page.js#L527. Untuk fitur inti RAB, ini risiko integritas data tertinggi.

Registrasi bisa menghasilkan akun auth yatim bila insert ke members gagal. Flow signup membuat user di Supabase Auth lebih dulu, lalu baru insert profil ke tabel members; bila insert kedua gagal, user sudah tercipta tapi aplikasi tidak punya profil/role yang dibutuhkan. Lihat app/register/page.js#L24 sampai app/register/page.js#L58. Ini akan memunculkan user yang sulit dipakai dan membebani admin.

Hapus user di panel admin tampak belum bisa benar-benar jalan karena memanggil RPC yang tidak saya temukan di migrasi lokal. UI memanggil delete_user_entirely di app/dashboard/admin/users/page.js#L84 sampai app/dashboard/admin/users/page.js#L93, tetapi pencarian migrasi hanya menunjukkan get_all_users_admin dan patch expired_at, tidak ada definisi delete_user_entirely. Ini berarti aksi delete kemungkinan selalu gagal di environment yang mengikuti repo ini.

Pipeline kualitas belum hijau. npm run lint masih gagal karena error react/no-unescaped-entities di app/admin/konversi/page.js, app/dashboard/katalog-ahsp/page.js, dan app/dashboard/new-project/page.js, plus beberapa useEffect dependency warning di file admin/sidebar. npm run build juga belum memberi bukti lolos production karena berhenti di spawn EPERM, jadi readiness deploy masih rendah.

Arsitektur akses data sangat bergantung pada query Supabase langsung dari client dan sinkronisasi migrasi yang tepat. Client dibuat langsung di lib/supabase.js, lalu dipakai di login, dashboard, editor proyek, upload admin, dan admin users. Ini aman hanya kalau RLS/RPC di semua environment benar-benar sinkron. Repo sendiri menunjukkan drift desain yang nyata: skema awal masih workspace-based di supabase/migrations/20260403120000_prd_initial_schema.sql, lalu diganti owner-based di supabase/migrations/20260405120000_projects_owner_no_workspaces.sql. Frontend sudah mengasumsikan bentuk terbaru, jadi environment yang tertinggal akan rawan gagal secara halus.

UX error handling masih lemah di operasi kritis. Contohnya hapus proyek di dashboard tidak memeriksa error hasil delete dan langsung reload data di app/dashboard/page.js#L68 sampai app/dashboard/page.js#L74. Jika RLS menolak atau query gagal, user tidak mendapat umpan balik yang jelas.

Struktur Aplikasi
Aplikasi ini adalah Next.js App Router dengan fondasi cukup sederhana: root layout di app/layout.js, dashboard shell di app/dashboard/layout.js, navigasi di components/Sidebar.jsx, dan semua modul utama memakai client component serta Supabase browser client.

Modul yang saat ini benar-benar terlihat terimplementasi:

Auth publik: app/login/page.js, app/register/page.js
Dashboard proyek: app/dashboard/page.js
Editor RAB/proyek besar: app/dashboard/new-project/page.js
Admin upload master dan konversi: app/admin/upload-data/page.js, app/admin/konversi/page.js
Admin manajemen user: app/dashboard/admin/users/page.js
Secara arsitektur, file editor proyek adalah hotspot maintainability terbesar: satu file hampir 1000 baris yang mencampur auth check, data loading, state bisnis, kalkulasi, export Excel, modal identitas, dan rendering tabel kompleks. Itu memperlambat perubahan dan menaikkan risiko regresi.

Kesiapan Produksi
Belum siap produksi. Hambatan terbesarnya bukan cuma lint/build, tapi kombinasi critical write flow yang belum transactional, dependensi kuat pada RLS/RPC yang harus sangat sinkron, dan tidak adanya safety net test otomatis.

Dibanding PRD di PRD.md, implementasi saat ini baru mencakup sebagian area web untuk auth, RAB, upload data master, dan admin user. Banyak target besar PRD belum tampak ada: workspaces multi-tenant penuh, mobile/offline sync, daily progress, dokumentasi foto, MC/CCO, schedule/Kurva S, PDF reporting, dan paywall rule yang konsisten. Jadi secara produk pun ini masih fase awal, bukan baseline release penuh.

Verifikasi
Saya menjalankan inspeksi repo, membaca file inti frontend dan migrasi Supabase, lalu menjalankan npm run lint dan npm run build. Tidak ada file yang saya ubah.