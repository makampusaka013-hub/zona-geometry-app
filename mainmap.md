# System Main Map: RAB Dashboard & Persistence

## 🏗️ Architecture Overview
This module handles the construction, editing, and persistence of the RAB (Rencana Anggaran Biaya). It connects the UI state (Zustand) with Supabase via a stabilized service layer.

## 📁 Key Components & Flow

### 1. UI Layer (`/app/dashboard/rekap-proyek/page.js`)
- **State Orchestrator**: Manages tab switching (RAB, Progress, Export, CCO).
- **Deep Sync**: Triggers data fetching from Supabase on every project/tab change to ensure UI consistency.
- **URL Handling**: Synchronizes `projectId` to the browser URL for direct access.

### 2. RAB Editor (`/components/tabs/RabEditorTab.jsx`)
- **Grid System**: Interactive table for editing Volume, Price, and AHSP Analysis.
- **Header Controls**: Compact UI for Global Profit and Project Start Date.
- **Persistence Hooks**: Triggers manual save sequences on desktop/mobile sidebars.

### 3. Service Layer (`/lib/services/rabService.js`)
- **`saveRabData` (Optimized)**: Uses Bulk Upsert for performance and RLS compliance.
- **`fetchRabMasterData`**: Loads AHSP catalogs and regional prices.

### 4. Database Schema (Supabase)
- **RAB Core**: `public.projects`, `public.ahsp_lines`, `public.ahsp_line_snapshots`.
- **Change Management**: `public.project_cco` (CCO), `public.project_mc` (Mutual Check).
- **Execution Tracking**: `public.project_progress_daily`, `public.daily_reports`.
- **Volume Calculations**: `public.project_backup_volume` (Back-up Volume support).
- **User Context**: `public.members` (Extended user data), `public.locations`.

### 5. Reporting Engine (`/lib/excel_engine.js`)
- **Anti-Corruption Engine**: Uses surgical deletion of metadata (Defined Names, Print Area) to preserve Excel XML integrity.
- **Calendar-Aligned Schedule**: Week headers (M1-M5) automatically sync with calendar months for professional timeline accuracy.
- **Borderless Cover Layout**: Zero-margin, footer-less cover printing (A1:N65) with high-fidelity "fit-to-page" scaling.
- **Browser Compatibility**: Implements 100ms download delay and DOM anchoring to fix missing extensions in Chrome/Incognito.

## 🛠️ Status & Stability
| Feature | Status | Note |
| :--- | :--- | :--- |
| **Manual Save** | ✅ STABLE | Uses Bulk Upsert & RLS compliance. |
| **Tab Sync** | ✅ STABLE | Deep data refresh implemented. |
| **Excel Export** | ✅ STABLE | v2.1: Calendar sync & Borderless Cover fix. |
| **UI Polish** | ✅ STABLE | Full-viewport modal blur & high z-index overlays. |
| **RAB Snapshots** | ✅ STABLE | Versioning via `ahsp_line_snapshots`. |
| **CCO / MC** | ⏳ IN-DEV | Tables ready: `project_cco`, `project_mc`. |

## 🛡️ Security (RLS)
Persistence is protected by Supabase RLS. All inserts/updates must include:
- `user_id` & `created_by` (Projects table)
- `updated_by` (AHSP Lines table)
- `client_id` (Sync consistency for local-first operations).
- Valid `project_id` association.

---
*Last Updated: 2026-05-01 by Antigravity AI*
