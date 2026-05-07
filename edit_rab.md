# Integrasi Database "Satu Kesatuan" - Zona Geometry

Dokumen ini menjelaskan bagaimana sistem RAB, Dashboard, dan TKDN sekarang terhubung secara otomatis sebagai satu kesatuan yang sinkron melalui database.

## 1. Konsep "Single Source of Truth" (SSOT)
Seluruh tab di aplikasi sekarang merujuk ke satu sumber data utama yang sama di database:
- **`view_project_resource_summary`**: View ini adalah jantung dari sistem. Ia menggabungkan data dari `ahsp_lines`, `ahsp_line_snapshots`, dan `analisa_custom` untuk menghitung harga terpakai dan TKDN secara real-time.
- **Konsistensi**: Jika Anda mengubah harga di katalog atau melakukan override harga di proyek, perubahan tersebut akan langsung tercermin di tab **Data Terpakai**, **TKDN**, dan **Dashboard Utama** tanpa perlu perhitungan manual ulang di sisi aplikasi.

## 2. Alur Proses Hitungan RAB
Data mengalir sebagai berikut:
1. **Input RAB**: User memasukkan item di tab **Edit RAB**.
2. **Resolusi Harga**: Sistem secara otomatis mencari harga terbaik (Prioritas: *Custom Override* > *Regional Dasar* > *Global*).
3. **Penyimpanan (Auto-Sync)**: Saat data disimpan (`saveRabData`), sistem merekam snapshot kondisi saat itu.
4. **Agregasi**: Database menghitung kontribusi nilai per item dan persentase TKDN.
5. **Visualisasi**: Tab Dashboard dan Tab Terpakai mengambil data hasil agregasi tersebut secara langsung.

## 3. Keluar dari "Empty State" (Tab Terkoneksi)
Untuk memastikan semua tab terisi dan tidak kosong:
- **Koneksi Database**: Pastikan migrasi `20260507110000_fix_resource_summary_comprehensive.sql` dan `20260507120000_fix_catalog_views_v2.sql` sudah dijalankan.
- **Data Analisa**: Sistem sekarang memprioritaskan `analisa_custom` sehingga item manual yang Anda buat tetap akan terhitung TKDN-nya selama komponen penyusunnya (Bahan/Upah/Alat) diisi.
- **Otomatisasi**: Anda tidak perlu lagi mengklik tombol "Refresh" berkali-kali; perpindahan antar tab akan memicu pengambilan data terbaru yang sudah divalidasi oleh database.

## 4. Cara Menyimpan Data Secara Aman
- Klik tombol **Simpan** pada tab Edit RAB untuk melakukan sinkronisasi massal (*Atomic Save*).
- Sistem akan memastikan `project_id` dan `identity` proyek tetap terjaga konsistensinya untuk menghindari data "melayang" (ghost projects).

---
*Sistem ini dirancang untuk memastikan integritas data antara laporan teknis dan nilai finansial proyek.*
