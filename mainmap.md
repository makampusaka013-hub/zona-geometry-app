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

    subgraph Service_Layer_Hardened
        ProjectStore <--> Service[rabService.js]
        RabStore <--> Service
        Service -- "Atomic RPC Save" --> Supabase[(Supabase Hardened DB)]
    end

    subgraph Data_Governance_Layer
        Supabase --> AuditLogs[Audit Logs Table]
        Supabase --> SoftDelete[Soft Delete Mechanism]
        Supabase --> Precision[Numeric 18,2 Precision]
    end

    subgraph Realtime_Hardened_Sync
        Supabase <--> Realtime[useRabRealtime.js]
        Realtime -- "ClientId Filter + Zod" --> RabStore
        RabStore -- "Anti-Loop" --> Service
    end

    subgraph Server_Side_Processing
        Export --> API[/api/export/excel]
        API -- "Concurrency Limit (Semaphore)" --> ExcelEngine[excel_engine.js]
    end
```

---

## 📂 Directory Structure Detail

### 1. 🌐 Routes & Security (`/app`)
*   **`middleware.js`**: Auth Guard yang memproteksi rute `/dashboard/*` menggunakan session Supabase.
*   **`/`**: Halaman utama (Hero, Features, Pricing).
*   **`/dashboard`**:
    *   `page.js`: Dashboard utama dengan **Granular Error Boundaries** per-tab.
    *   **`/api/export/excel`**: Server-side route dengan **Concurrency Control** (max 5 jobs) untuk stabilitas server.

### 2. 🧠 State Management (`/store`)
*   **`useProjectStore.js`**: Mengelola metadata proyek, keanggotaan (RBAC), dan daftar proyek (Normalized).
*   **`useRabStore.js`**: Mengelola item RAB. Mendukung **ClientId Source Tagging** (via `window.name`) untuk mencegah feedback loop pada multi-tab sync.
*   **`useScheduleStore.js`**: Menangani durasi dan urutan pekerjaan dengan **Auto-sync** dari RAB state.

### 3. 🧩 UI Components (`/components`)
*   **`tabs/`**: Modul fungsional yang reaktif:
    *   **`RabEditorTab.jsx`**: Engine penyusunan RAB dengan **Namespaced Draft Persistence** (`rab-draft:{userId}:{projectId}:{version}`) untuk keamanan data multi-user.
*   **`ErrorBoundary.js`**: Komponen isolasi error untuk setiap tab dashboard.

### 4. ⚙️ Service Layer (`/lib/services`)
*   **`rabService.js`**: Data Access Layer yang kini menggunakan **Atomic Save RPC** (`save_project_atomic`) untuk menjamin transaksi *all-or-nothing*.
*   **`validations/rabSchema.js`**: Validasi payload menggunakan **Zod** untuk semua data masuk (Realtime & Form).

### 5. 🗄️ Database Layer (`/supabase/migrations`)
*   **Unified User System**: Integrasi `auth.users` langsung ke `members` tanpa tabel profile redundan.
*   **Referential Integrity**: Standardisasi Foreign Keys ke `members.user_id` dengan `ON DELETE CASCADE`.
*   **Data Governance**: Implementasi `audit_logs` untuk audit trail dan `deleted_at` untuk soft-delete.
*   **Precision Hardening**: Penggunaan `numeric(18,2)` secara konsisten untuk kolom finansial.
*   **Auth Resiliency**: Login flow diperkeras dengan **Auto-Displacement** (1-Web/1-Mobile) dan perbaikan **SessionGuard race condition** untuk stabilitas login. [STABILIZED]
*   **Security Hardening**: Perbaikan `search_path` dan pembatasan akses RPC untuk fungsi internal (Linter Fixes). [DONE]
*   **Database Atomic Integrity**: Implementasi `Nuclear Trigger Reset` dengan Exception Handling untuk sinkronisasi `auth.users` -> `members` yang anti-gagal. [IMPLEMENTED]

---

## 🛠️ Tech Stack
*   **Frontend**: Next.js 15 (App Router), React 19.
*   **State Management**: Zustand (Modular & Normalized).
*   **Concurrency**: Optimistic Locking (`version`), ClientId Loop Prevention, & Atomic RPC Transactions.
*   **Resiliency**: SessionGuard Heartbeat, Nuclear Trigger Recovery, & Namespaced Local Drafts.
*   **Security**: Supabase SSR Auth + Hardened RLS + Unified User Identity.
*   **Reporting**: Server-Side ExcelJS with Concurrency Throttling.

---
*Main Map Last Updated: 2026-04-30 (Phase 15 - Session Resilience & Robust User Synchronization)*
