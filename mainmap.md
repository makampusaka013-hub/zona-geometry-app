# Zona Geometry Application Main Map

## 🗺️ Architecture Overview
Zona Geometry adalah aplikasi SaaS untuk penyusunan RAB (Rencana Anggaran Biaya), Manajemen Proyek, dan Pelaporan Konstruksi secara otomatis.

```mermaid
graph TD
    User((User)) --> Landing[Landing Page /]
    
    subgraph Authentication
        Landing --> Login[/login]
        Landing --> Register[/register]
        Login --> AuthHandler[authService.js]
        Register --> AuthHandler
    end

    subgraph Dashboard_Core
        AuthHandler --> MainDashboard[/dashboard]
        MainDashboard --> RekapProyek[/dashboard/rekap-proyek]
        MainDashboard --> KatAHSP[/dashboard/katalog-ahsp]
        MainDashboard --> KatHarga[/dashboard/katalog-harga]
    end

    subgraph Project_Editor_Tabs
        RekapProyek --> Editor[RabEditorTab.jsx]
        Editor --> Schedule[ScheduleTab.jsx]
        Editor --> Backup[BackupVolumeTab.jsx]
        Editor --> Export[ExportImportTab.jsx]
        Editor --> TKDN[TkdnTab.jsx]
    end

    subgraph Database_Supabase
        Editor <--> db_projects[(projects)]
        Editor <--> db_ahsp[(ahsp_lines)]
        KatAHSP <--> db_katalog[(master_ahsp)]
        KatHarga <--> db_harga[(master_harga)]
        Presence <--> Realtime[Presence/Realtime]
    end

    subgraph Service_Layer
        Editor --> Service[rabService.js]
        Service --> Validation[rabSchema.js]
        Validation --> Supabase[(Supabase)]
    end
```

---

## 📂 Directory Structure Detail

### 1. 🌐 Routes (`/app`)
*   **`/`**: Halaman utama (Hero, Features, Pricing).
*   **`/login` & `/register`**: Autentikasi pengguna.
*   **`/dashboard`**:
    *   `page.js`: Ringkasan statistik (Total Proyek, Anggaran).
    *   **`/rekap-proyek`**: Modul utama manajemen proyek. Di sinilah **RabEditorTab** aktif.
    *   **`/katalog-ahsp`**: Manajemen Analisa Harga Satuan Pekerjaan.
    *   **`/katalog-harga`**: Database harga material, upah, dan alat.
    *   **`/report`**: Generasi laporan otomatis.
    *   **`/profile`**: Pengaturan akun.

### 2. 🧩 Core Components (`/components`)
*   **`Sidebar.jsx`**: Navigasi utama aplikasi.
*   **`tabs/`**: Berisi modul fungsional dalam Editor Proyek:
    *   **`RabEditorTab.jsx`**: Engine penyusunan RAB (Advanced Mode).
    *   **`ScheduleTab.jsx`**: Manajemen jadwal (Kurva S).
    *   **`BackupVolumeTab.jsx`**: Perhitungan volume teknis.
    *   **`ExportImportTab.jsx`**: Ekspor ke Excel (Engine ExcelJS).
    *   **`IfcVolumeExtractor.jsx`**: Integrasi dengan file BIM/IFC.

### 3. ⚙️ Utilities & Backend (`/lib`, `/supabase`)
*   **`lib/services/`**: Service Layer (Decoupling UI from DB).
    *   `rabService.js`: Business logic untuk transaksi RAB.
    *   `authService.js`: Centralized Auth Handler (Login, Register, OAuth).
*   **`lib/validations/`**: Schema validation menggunakan Zod.
    *   `rabSchema.js`: Aturan integritas data proyek dan item.
*   **`lib/hooks/`**: Custom hooks (e.g., `useProjectPresence.js`).
*   **`lib/`**: Fungsi pembantu untuk kalkulasi keuangan dan format angka Indonesia.

---

## 🛠️ Tech Stack
*   **Frontend**: Next.js 15 (App Router), React 19.
*   **Styling**: Tailwind CSS (Vanilla).
*   **Icons**: Lucide React.
*   **Backend/DB**: Supabase (PostgreSQL, Realtime Presence, Auth).
*   **Reporting**: ExcelJS for Custom XLSX Generation.
*   **Validation**: Zod (Schema-based).

---
*Main Map Last Updated: 2026-04-29 (Phase 6 Completed)*
