# Rekapitulasi Perbaikan Mesin Pelaporan Excel - Zona Geometry

Dokumen ini merangkum seluruh pembaruan dan perbaikan yang telah diterapkan pada mesin pelaporan Excel (`lib/excel_engine.js`) dan antarmuka ekspor (`ExportImportTab.jsx`).

## 1. Pemisahan Pelaporan Sumber Daya
*   **Sheet: Harga Satuan (Master)**: Berfungsi sebagai daftar harga dasar referensi proyek.
    *   Kolom: No (B), Uraian (D), Kode (E), Satuan (F), Harga (G), dan TKDN (I).
    *   Menjadi sumber tunggal untuk seluruh rumus `VLOOKUP` di sheet AHSP dan RAB.
*   **Sheet: Harga Satuan Terpakai (Detail)**: Berfungsi sebagai analisis kebutuhan material riil.
    *   Kolom: No (B), Uraian (C), Kode (E), Satuan (F), **Volume Total (G)**, Harga (H), **Total Harga (I)**, Ket (J), **Persentase % (K)**, dan TKDN (L).
    *   Menghitung otomatis akumulasi volume dari seluruh RAB dan bobot biaya per item terhadap total proyek.

## 2. Optimalisasi Pengaturan Cetak (Print Settings)
*   **Margin Presisi**:
    *   Kiri: 2 cm (0.78") - Optimal untuk penjilidan.
    *   Atas & Kanan: 0.64 cm (0.25") - Memaksimalkan area data.
    *   Bawah: 1 cm (0.39") - Ruang untuk catatan kaki.
*   **Branding & Navigasi**:
    *   Header: Dihapus sepenuhnya sesuai permintaan untuk tampilan bersih.
    *   Footer: Menampilkan **"by : ZG"** (Tebal, Orange, 10pt) dan Nomor Halaman.
*   **Fleksibilitas Kertas**: Mendukung pilihan ukuran **A4** (paperSize 9) dan **F4/Folio** (paperSize 13).
*   **Orientasi Otomatis**: Portrait untuk laporan standar, Landscape untuk **Schedule/Kurva-S** dan **Rekap**.

## 3. Perbaikan Bug Area Cetak (Print Area)
*   **Highest Row Tracker**: Mengganti `actualRowCount` dengan pelacak indeks baris absolut (`highestRowWithData`). Memastikan area cetak tidak menyusut jika ada baris kosong di tengah data.
*   **Cakupan Kolom Luas**:
    *   AHSP: A sampai O.
    *   Harga Satuan Terpakai: A sampai M.
    *   Harga Satuan (Master): A sampai J.
    *   HSP: A sampai I.
*   **Buffer Row**: Menambahkan otomatis **+1 baris kosong** di bawah data terakhir agar tampilan tidak terpotong.

## 4. Manajemen Sheet Dinamis
*   **Auto-Pruning**: Menghapus otomatis sheet yang tidak dicentang oleh user saat proses ekspor.
*   **Empty Data Filter**: Menghapus otomatis sheet yang terpilih namun tidak memiliki data proyek (hanya berisi header), sehingga tidak ada kertas kosong yang terhitung saat diprint.

## 5. Struktur Analisa (AHSP)
*   **Penomoran BAB**: Menambahkan nomor Romawi (I, II, III, dst.) pada Kolom B untuk setiap baris BAB di sheet AHSP.
*   **Sinkronisasi Rumus**: Seluruh detail AHSP kini melakukan `VLOOKUP` harga ke sheet "Harga Satuan" untuk memastikan konsistensi nilai.

---
*Status: Implementasi Selesai & Sinkron ke GitHub.*
