# Zona Geometry Application Main Map

## 🗺️ Architecture Overview
Zona Geometry adalah aplikasi SaaS untuk penyusunan RAB (Rencana Anggaran Biaya), Manajemen Proyek, dan Pelaporan Konstruksi secara otomatis. Aplikasi ini menggunakan arsitektur **Modular State Management** dengan **Optimistic Concurrency Control** untuk memastikan integritas data multi-user.

```mermaid
graph TD
    User((User)) --> Landing[Landing Page /]
    
    subgraph Authentication_Guard
        Landing --> Middleware[middleware.js]
        Middleware --> Login[/login]
        Middleware --> Dashboard[/dashboard/*]
        Login --> AuthHandler[authService.js]
    end

    subgraph Modular_Stores_SSOT
        Dashboard --> ProjectStore[useProjectStore.js]
        Dashboard --> RabStore[useRabStore.js]
        Dashboard --> ScheduleStore[useScheduleStore.js]
        Dashboard --> UIStore[useUIStore.js]
    end

    subgraph Dashboard_Core_UI
        ProjectStore <--> RekapProyek[/dashboard/rekap-proyek]
        RabStore <--> RekapProyek
        KatAHSP[/dashboard/katalog-ahsp]
        KatHarga[/dashboard/katalog-harga]
    end

    subgraph Project_Editor_Tabs
        RekapProyek --> Editor[RabEditorTab.jsx]
        RekapProyek --> Schedule[ScheduleTab.jsx]
        RekapProyek --> Backup[BackupVolumeTab.jsx]
        RekapProyek --> Export[ExportImportTab.jsx]
    end

    subgraph Service_Layer_with_Concurrency
        ProjectStore <--> Service[rabService.js]
        RabStore <--> Service
        Service <--> Supabase[(Supabase DB + Versioning)]
    end

    subgraph Server_Side_Processing
        Export --> API[/api/export/excel]
        API --> ExcelEngine[excel_engine.js]
    end
```

---

## 📂 Directory Structure Detail

### 1. 🌐 Routes & Security (`/app`)
*   **`middleware.js`**: Auth Guard yang memproteksi rute `/dashboard/*` menggunakan session Supabase.
*   **`/`**: Halaman utama (Hero, Features, Pricing).
*   **`/dashboard`**:
    *   `page.js`: Ringkasan statistik (Total Proyek, Anggaran).
    *   **`/rekap-proyek`**: Modul utama manajemen proyek. Menggunakan **useRabStore** untuk data teknis dan **useProjectStore** untuk metadata.
    *   **`/api/export/excel`**: Server-side route untuk ekspor laporan besar tanpa membebani memori browser.

### 2. 🧠 State Management (`/store`)
*   **`useProjectStore.js`**: Mengelola metadata proyek, keanggotaan (RBAC), dan daftar proyek (Normalized).
*   **`useRabStore.js`**: Mengelola item RAB secara mendalam (Normalized). Mendukung draft local state untuk menghindari data overwrite.
*   **`useScheduleStore.js`**: Khusus menangani durasi dan urutan pekerjaan (Kurva S).
*   **`useUIStore.js`**: Mengelola state UI global seperti modal, loading, dan notifikasi.

### 3. 🧩 UI Components (`/components`)
*   **`tabs/`**: Berisi modul fungsional yang reaktif terhadap Modular Stores:
    *   **`RabEditorTab.jsx`**: Engine penyusunan RAB dengan fitur **Conflict Detection** (Optimistic Locking).
    *   **`ExportImportTab.jsx`**: Interface ekspor yang terhubung ke Server-Side API.
*   **`ErrorBoundary.js`**: Pelindung runtime error di level Dashboard Layout.

### 4. ⚙️ Service Layer (`/lib/services`)
*   **`rabService.js`**: Data Access Layer dengan validasi **Zod** dan pengecekan **Version Tag** untuk mencegah konflik multi-user.

### 5. 📊 Reporting Engines (`/lib`)
*   **`excel_engine.js`**: Engine utama pengolah XLSX yang kini dioptimalkan untuk sisi server.

---

## 🛠️ Tech Stack
*   **Frontend**: Next.js 15 (App Router), React 19.
*   **State Management**: Zustand (Modular & Normalized).
*   **Concurrency**: Optimistic Locking with `version` tags.
*   **Security**: Supabase SSR Auth + RLS Hardened.
*   **Reporting**: Server-Side ExcelJS for Large Scale Reports.

---
*Main Map Last Updated: 2026-04-30 (Phase 11 - Modular Store & Concurrency Refactor)*
