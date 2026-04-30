# Zona Geometry Application Main Map

## 🗺️ Architecture Overview
Zona Geometry adalah aplikasi SaaS untuk penyusunan RAB (Rencana Anggaran Biaya), Manajemen Proyek, dan Pelaporan Konstruksi secara otomatis. Aplikasi ini menggunakan arsitektur **Single Source of Truth (SSOT)** untuk memastikan konsistensi data di seluruh dashboard.

```mermaid
graph TD
    User((User)) --> Landing[Landing Page /]
    
    subgraph Authentication_Guard
        Landing --> Middleware[middleware.js]
        Middleware --> Login[/login]
        Middleware --> Dashboard[/dashboard/*]
        Login --> AuthHandler[authService.js]
    end

    subgraph State_Management_SSOT
        Dashboard --> Store[useProjectStore.js - Zustand]
    end

    subgraph Dashboard_Core_UI
        Store <--> RekapProyek[/dashboard/rekap-proyek]
        Store <--> KatAHSP[/dashboard/katalog-ahsp]
        Store <--> KatHarga[/dashboard/katalog-harga]
    end

    subgraph Project_Editor_Tabs
        RekapProyek --> Editor[RabEditorTab.jsx]
        RekapProyek --> Schedule[ScheduleTab.jsx]
        RekapProyek --> Backup[BackupVolumeTab.jsx]
        RekapProyek --> Export[ExportImportTab.jsx]
    end

    subgraph Service_Layer_Data_Access
        Store <--> Service[rabService.js]
        Service <--> Supabase[(Supabase DB)]
    end
```

---

## 📂 Directory Structure Detail

### 1. 🌐 Routes & Security (`/app`)
*   **`middleware.js`**: Auth Guard yang memproteksi rute `/dashboard/*` menggunakan session Supabase.
*   **`/`**: Halaman utama (Hero, Features, Pricing).
*   **`/login` & `/register`**: Autentikasi pengguna.
*   **`/dashboard`**:
    *   `page.js`: Ringkasan statistik (Total Proyek, Anggaran).
    *   **`/rekap-proyek`**: Modul utama manajemen proyek. Mengandalkan state dari **useProjectStore**.
    *   **`/katalog-ahsp`**: Manajemen Analisa Harga Satuan Pekerjaan.
    *   **`/katalog-harga`**: Database harga material, upah, dan alat.
    *   **`/report`**: Generasi laporan otomatis.

### 2. 🧠 State Management (`/store`)
*   **`useProjectStore.js`**: Centralized Global Store (Zustand). Mengelola state proyek, anggota, dan sinkronisasi data antar tab. Menghilangkan ketergantungan langsung komponen UI ke database.

### 3. 🧩 UI Components (`/components`)
*   **`tabs/`**: Berisi modul fungsional yang sepenuhnya reaktif terhadap Store:
    *   **`RabEditorTab.jsx`**: Engine penyusunan RAB (Advanced Mode).
    *   **`ScheduleTab.jsx`**: Manajemen jadwal (Kurva S).
    *   **`BackupVolumeTab.jsx`**: Perhitungan volume teknis.
    *   **`ExportImportTab.jsx`**: Ekspor ke Excel (Engine ExcelJS).

### 4. ⚙️ Service Layer (`/lib/services`)
*   **`rabService.js`**: Exclusive Data Access Layer. Satu-satunya tempat yang diizinkan melakukan query Supabase untuk data proyek dan RAB.
*   **`authService.js`**: Centralized Auth Handler (Login, Register, OAuth).

### 5. 📊 Reporting Engines (`/lib`)
*   **`excel_engine_static.js`**: Engine khusus ekspor RAB, AHSP, dan HSP.
*   **`laporan_excel_static.js`**: Engine laporan progres fisik dengan integrasi sheet `database`.
*   **`excel_utils.js`**: Library utilitas bersama untuk pemformatan Excel.

---

## 🛠️ Tech Stack
*   **Frontend**: Next.js 15 (App Router), React 19.
*   **State Management**: Zustand (Single Source of Truth).
*   **Security**: Supabase SSR Auth + Next.js Middleware.
*   **Styling**: Tailwind CSS (Vanilla).
*   **Backend/DB**: Supabase (PostgreSQL, Realtime).
*   **Reporting**: ExcelJS for Custom XLSX Generation.

---
*Main Map Last Updated: 2026-04-30 (Phase 10 - SSOT Architecture & Zustand Centralization)*
