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
| **Manual Save** | ✅ STABLE | v2.2: Optimized with **Bulk Upsert**. |
| **Tab Sync** | ✅ STABLE | Deep data refresh & RLS compliance. |
| **Excel Export** | ✅ STABLE | v2.1: Calendar sync & Borderless Cover fix. |
| **Database Integrity** | ✅ STABLE | Full **FK Cascading** & Reference standardization. |
| **Versioning** | ✅ STABLE | Auto-snapshots via **DB Triggers**. |
| **Security Audit** | ✅ HARDENED | Search-path locked, SD functions secured. |
| **CCO / MC** | ⏳ IN-DEV | Data layer ready; UI implementation pending. |

## 🛡️ Security & Architecture
- **RLS Enforcement**: Access is controlled via `project_members` collaboration logic.
- **Reference Integrity**: All user context resolved via `public.members(user_id)`.
- **Atomic Operations**: Versioning and updated timestamps managed by PostgreSQL triggers for 100% audit accuracy.
- **Performance**: GIN indexes applied to JSONB analysis for sub-second retrieval.

---
*Last Updated: 2026-05-02 by Antigravity AI*
