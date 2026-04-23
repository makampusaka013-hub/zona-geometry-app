# Checklist Progres PRD (Product Requirements Document)

Dokumen ini melacak status pengerjaan fitur berdasarkan dokumen `PRD.md` dan kondisi sistem saat ini.

---

## 1. Objective & User Roles
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Sistem Autentikasi** | Register & Login beroperasi penuh. **Enforcement Akses**: User 'Pending'/'Suspended' otomatis diblokir & logout. |
| ✅ | **Pembagian Peran (Roles)** | Modul `Kelola User` khusus Admin sepenuhnya matang. Role (admin, pro, normal, view), kontrol masa aktif (`expired_at`), perlindungan akses (Admin Bypass), serta fungsi Hapus Akun via Secure RPC. |
| ✅ | **Mode Pro (Kontraktor)** | RAB/Estimator stabil. Katalog Harga Custom + Price Override per AHSP aktif. Modul CCO & MC-0 fungsional. |
| ✅ | **Mode Normal (Pelaksana)** | Input progres harian (Volume, Bahan, Tenaga) live 1-365 hari. |
| ✅ | **Mode View (Owner)** | Akses *read-only* aktif di Dashboard dengan Monitoring Kurva S kumulatif. |

---

## 2. Project Metadata
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Input Identitas Proyek** | Modul Pembuatan/Edit proyek via RPC transaksional bebas fragmentasi. |
| ✅ | **Data Kontrak & Waktu** | Nomor Kontrak, Nilai/Pagu (HSP), PPN, Tahun Anggaran — 100% fungsional. |
| ✅ | **Tanggal Mulai Proyek (T+0)** | Kolom `start_date` pada tabel `projects`, *auto-save* ke Supabase, dan digunakan sebagai acuan Gantt Chart. |
| ✅ | **Labor Settings Persisten** | Kolom `labor_settings` JSONB pada tabel `projects`, berisi kuantitas tenaga kerja & efektivitas proyek, disimpan & dimuat otomatis. |
| ✅ | **Data Stakeholder** | Field *PPK, PPTK, Konsultan, dan Kontraktor* sudah terintegrasi di Modal Identitas & Laporan Excel. |

---

## 3. Core Modules

### A. Database Master & AHSP ✅
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Master Resource** | Upload Master Harga (Alat, Bahan, Upah) via CSV oleh Admin. |
| ✅ | **TKDN Tracking** | TKDN per item, sync dinamis ke AHSP via JOIN view. |
| ✅ | **AHSP Builder / Kalkulasi** | Relasi antar item & `view_analisa_ahsp` stabil. Inline Editing faktor konversi + sumber harga. |
| ✅ | **HPS vs Penawaran** | UI Evaluasi HSP sudah menyatu di Editor RAB. |

### B. RAB & Volume Management ✅
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Struktur Pekerjaan (WBS)** | Drag & Drop, Hapus, Kolom Harga Satuan Detail — solid tanpa error React Hook. |
| ✅ | **Input Volume & Calculation** | Kalkulasi Harga Satuan AHSP, presisi desimal tanpa pembulatan dini. |
| ✅ | **Lumpsum Mode** | Tombol `+ Custom` mencetak Item Manual Lumpsum (Nama & Harga Bebas). |

### C. Katalog Harga Custom (Pro) 🆕 ✅
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Tabel `master_harga_custom`** | RLS per `user_id`. Kode auto-generate (A.C001, L.C001, M.C001, C.C001). |
| ✅ | **View Gabungan UNION** | `view_master_harga_gabungan` menggabungkan PUPR + Custom dengan prioritas Custom. |
| ✅ | **Override Harga per Item PUPR** | `overrides_harga_dasar_id` — user Pro bisa menetapkan harga personal untuk item PUPR. |
| ✅ | **Override per Baris Rincian AHSP** | `user_ahsp_price_override` (tabel baru) — per user, per detail baris AHSP, via modal terpusat. |
| ✅ | **Auto Price Injection di View AHSP** | `security_invoker = true` + `auth.uid()` — harga personal otomatis masuk ke kalkulasi tanpa mapping ulang. |
| ✅ | **Sumber Harga Transparan** | Kolom `sumber_harga` di JSON details: `pupr-auto`, `pupr-mapped`, `override-pupr`, `override-custom`, `override-langsung`. |

### D. Execution & Monitoring 🔄
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Daily Progress** | Modul 1-365 hari (Volume, Bahan, Tenaga) dengan grid sticky, auto-save (unified key), dan sinkronisasi real-time. |
| ✅ | **Manpower Analysis (TKE)** | Konsolidasi tab Schedule & Manpower. Kalkulasi TKE Kumulatif dari `labor_settings` JSONB. Ripple Effect pada tanggal jadwal. |
| ✅ | **Gantt Chart (Schedule)** | Terintegrasi di bagian atas tab Schedule dengan data sinkron dari tabel manpower bawah. |
| ✅ | **Photo Documentation** | Upload foto dengan Geotagging & Timestamp. Visualisasi gallery di tab Dokumentasi. |

### E. Resource Tracking & Utilization 🆕 🔄
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Rekap AHSP Terpakai** | Tab AHSP Terpakai live dari `ahsp_lines` per proyek terpilih. |
| ✅ | **Rekap Harga Satuan Terpakai** | Tab Harga Satuan join dari `view_project_resource_summary`. |
| ✅ | **Audit TKDN Proyek** | Tab TKDN pie chart & tabel kontribusi per komponen. |
| 🔲 | **Live Recalculation** | Jika harga satuan diubah di level proyek → seluruh AHSP terpakai terhitung ulang otomatis. |

### F. Construction Administration 🔲
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Mutual Check (MC-0 / MC-100)** | Tabel komparasi volume kontrak vs lapangan di tab Data Perubahan. |
| ✅ | **CCO (Contract Change Order)** | Sistem revisi volume (Revisi 1 sd Addendum Final) terintegrasi dengan kalkulasi deviasi. |
| ✅ | **Schedule & Kurva S** | Holistik Kurva-S (0-100%), penanda vertikal "Hari Ini", metrik deviasi dinamis, filter frekuensi, dan dukungan penuh item lumsum (default 1 hari). |

---

| ✅ | **Laporan Harian** | Integrasi progres harian ke dalam format pelaporan Excel teknis. |
| ✅ | **Laporan Mingguan** | Akumulasi cerdas progres 7 harian sesuai periode terpilih. |
| ✅ | **Laporan Bulanan** | Rekapitulasi progres bulanan untuk syarat termyn/tagihan. |
| ✅ | **Export Excel** | Premium Excel Reporting Engine dengan area tanda tangan stakeholder. |

---

## 5. Hybrid & Sync Logic 🔲
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| 🔲 | **Offline Mode (PWA/Mobile)** | Service Worker / Local Storage belum diatur. |
| 🔲 | **Auto-Sync & Push Notification** | Endpoint notifikasi Desktop belum aktif. |

---

## 6. Business Logic (Membership)
| Status | Fitur | Keterangan |
| :---: | --- | --- |
| ✅ | **Tier Gratis vs Pro** | Role-view, batasan proyek kadaluarsa aktif. Katalog Custom sudah terkunci ke role Pro & Admin. |
| ✅ | **Account Access Control** | Sistem aktivasi akun oleh Admin via `approval_status`. Integrasi RLS & client-side enforcement (Admin-always-active bypass). |

---

| 🎯 Next Priorities (Urutan Kerja)
1. **4. Reporting** — Export PDF laporan harian/bulanan
2. **2. Stakeholder** — Field Konsultan Pengawas & NIP PPK

---

## 🆕 Fitur Yang Baru Diselesaikan (Extra dari PRD Awal)
| Tanggal | Fitur | Keterangan |
| --- | --- | --- |
| 2026-04 | **Branding Zona Geometry App** | Logo SVG di Sidebar, Favicon `Logo_Small.svg`, Tab Browser "Zona Geometry App". |
| 2026-04 | **Global Project Selector** | Dropdown Proyek & Filter Bab persisten di atas semua Tab rekap-proyek. |
| 2026-04 | **Alur Navigasi Baru** | Hapus menu "Buat RAB" di Sidebar, konsolidasi ke tombol "+ Buat RAB Baru" di Daftar Proyek. |
| 2026-04 | **Tab Export/Import** | Ekspor RAB ke Excel dari tab baru. Placeholder Import. |
| 2026-04 | **Sticky Navigation Tab** | Bar navigasi tab (Daftar Proyek, Schedule, Progress, dll) "beku" di top viewport saat scroll. |
| 2026-04 | **Konsolidasi Schedule** | Tab Schedule & Manpower digabung. Gantt di atas, tabel input di bawah. |
| 2026-04 | **Grid Progress 1-365** | Grid harian interaktif untuk Volume, Bahan, dan Tenaga. Filter 3/6/12 bulan. |
| 2026-04 | **Custom Labor Roles** | Input kehadiran personil non-RAB (PPK, Inspektorat) di tab Progress. |
| 2026-04 | **Holistic Monitoring Dashboard** | Perhitungan deviasi & Kurva-S mencakup Lumsum. UI Dashboard premium dengan format mata uang presisi tinggi (`Rp ...,00-`). |
| 2026-04 | **Architectural & Data Audit** | Verifikasi build produksi (`next build` sukses), integrasi schema transaksional, dan audit readiness deploy: **READY**. |
| 2026-04 | **RAB Transparency (AHSP Code)** | Penambahan tampilan kode AHSP di editor RAB untuk kemudahan sinkronisasi katalog. |
| 2026-04 | **Dual-Theme UI System (IND/ORG)** | Implementasi sistem tema ganda: **Indigo (Light Mode)** untuk kesan professional premium, dan **Orange/Amber (Dark Mode)** sesuai branding ZONA Geometry. Harmonisasi di seluruh Dashboard, Profile, Katalog, dan Admin. |
| 2026-04 | **CCO & Mutual Check UI** | Implementasi tab "Data Perubahan" yang mencakup workflow Change Order (CCO) dan Mutual Check (Baseline vs Final). |
| 2026-04 | **Refinment StatCard & Theme Fix** | Perbaikan konsistensi warna kartu statistik dashboard dan resolusi build-error tab scheduling. |
| 2026-04 | **Theme-Aware Charts** | Implementasi palet warna dinamis pada S-Curve dan Gantt Chart (Indgo Light / Orange Dark). |
| 2026-04 | **Dashboard & UI Refinement** | Perbaikan *StatCard* (bebas truncation harga), konsistensi garis "Realisasi" Kurva-S sesuai tema, dan standarisasi header premium (slate-50/backdrop-blur) di seluruh modul. |
| 2026-04 | **Access Enforcement System** | Implementasi sistem aktivasi akun. Admin dapat mengubah Role, Status, dan Masa Aktif. Keamanan berlapis via `SECURITY DEFINER` RPC dan RLS bypass khusus Admin. |
| 2026-04 | **S-Curve & Dashboard Refinement** | Implementasi penanda vertikal "Hari Ini" pada S-Curve, visualisasi "Full-Width" tanpa scroll, metrik Deviasi Dinamis (Merah/Hijau + Ikon Tren), dan perbaikan UI Header (spacing logo vs status dot). |
| 2026-04 | **Branding & Identity Refresh** | Implementasi logo `logo_Text.svg` dan `logo.svg` baru dengan dukungan Dual-Theme (Oranye/Biru). Pembaharuan Favicon browser, penyelarasan horizontal status indicator, dan perbaikan ukuran branding di sidebar. |
| 2026-04 | **Strict Labor Filtering** | Pengetatan logika deteksi tenaga kerja hanya menggunakan prefix kode "L." (Labor) untuk memastikan akurasi dashboard Kapasitas Tenaga Kerja Global dan perhitungan durasi. |
| 2026-04 | **Auto Project Duration** | Implementasi fallback otomatis untuk tampilan durasi proyek di Header. Jika durasi manual kosong, sistem menghitung durasi total dari urutan jadwal Manpower. |
| 2026-04 | **Advanced Reporting Engine** | Implementasi mesin pembuat laporan (Harian/Mingguan/Bulanan) ke format Excel profesional dengan agregasi data progres masif. |
| 2026-04 | **Stakeholder Identity Integration** | Penambahan field administratif (PPK, PPTK, Konsultan, Kontraktor) dan tanda tangan laporan otomatis. |
| 2026-04 | **Sidebar Active Highlight Fix** | Perbaikan logika deteksi menu aktif menggunakan `startsWith` agar menu tetap menyala orange meskipun memiliki parameter query. |
| 2026-04 | **Account Expiry Tracking** | Penambahan rincian "Masa Aktif Akun" di halaman profil dengan deteksi warna merah jika sudah kadaluarsa. |
| 2026-04 | **AHSP Search Connectivity Fix** | Restorasi koneksi pencarian AHSP via `view_analisa_ahsp`. Support pencarian kode spesifik (e.g., "1.1.1.1"). |
| 2026-04 | **Result Hover Tooltips** | Penambahan `title` attribute pada hasil pencarian untuk menampilkan Uraian Pekerjaan secara utuh saat kursor diarahkan (hover). |
| 2026-04 | **PPN 0% Logic Fix** | Perbaikan bug `||` ke `??` yang mencegah penyimpanan nilai PPN 0%. Sekarang 0% adalah nilai valid yang bisa di-save. |
| 2026-04 | **RAB Tab Visibility Fix** | Penghapusan restriksi sub-tab "RAB Pekerjaan" sehingga selalu muncul bagi seluruh personil proyek (Owner/Admin/Pro/Normal). |
| 2026-04 | **Auto Project Start Date** | Inisialisasi otomatis `start_date` ke tanggal hari ini saat pembuatan proyek baru sebagai referensi jadwal awal. |

---

**Keterangan Simbol:**
- ✅ : **Selesai**
- 🔄 : **Dalam Pengerjaan / Parsial**
- 🔲 : **Belum Dimulai (Backlog)**
- 🆕 : **Fitur baru di luar PRD awal**

