-- ============================================================
-- Migration: 20260420210000_ADVANCED_INDEX_OPTIMIZATION
-- Goal: Fix "Unindexed Foreign Keys" and "Unused Indexes"
--       Clean redundancy in project_members.
-- ============================================================

-- 1. PEMBERSIHAN INDEX REDUNDAN & TIDAK TERPAKAI (DROP)
-- ------------------------------------------------------------

-- [project_members]
DROP INDEX IF EXISTS public.idx_project_members_project_id;
CREATE INDEX IF NOT EXISTS idx_project_members_assigned_by ON public.project_members (assigned_by);

-- [Cleanup Unused] Menghapus index yang benar-benar tidak diperlukan
DROP INDEX IF EXISTS public.idx_project_revisions_project_id;
DROP INDEX IF EXISTS public.idx_project_revisions_created_by;
DROP INDEX IF EXISTS public.idx_members_verification_token;
DROP INDEX IF EXISTS public.idx_uapo_ahsp_detail_id;

-- [user_ahsp_price_override] Unused Cleanup
DROP INDEX IF EXISTS public.idx_user_ahsp_price_override_user_id;
DROP INDEX IF EXISTS public.idx_user_ahsp_price_override_ahsp_detail_id;

-- [master_ahsp_details_custom] Cleanup for re-indexing
DROP INDEX IF EXISTS public.idx_master_ahsp_details_custom_ahsp_id;
DROP INDEX IF EXISTS public.idx_master_ahsp_details_custom_item_id;

-- [others] Unused Cleanup
DROP INDEX IF EXISTS public.idx_members_verification_token;
DROP INDEX IF EXISTS public.idx_daily_reports_project_id;
DROP INDEX IF EXISTS public.idx_daily_progress_report_id;
DROP INDEX IF EXISTS public.idx_project_photos_report_id;
DROP INDEX IF EXISTS public.idx_members_selected_location_id;
DROP INDEX IF EXISTS public.idx_projects_location_id;
DROP INDEX IF EXISTS public.idx_members_location;
DROP INDEX IF EXISTS public.idx_projects_location;
DROP INDEX IF EXISTS public.idx_project_photos_report;

-- [Identical/Duplicate Cleanup] Menghapus varian nama lama yang isinya sama
DROP INDEX IF EXISTS public.idx_manpower_analysis_item_id;
DROP INDEX IF EXISTS public.idx_master_ahsp_details_ahsp_id;
DROP INDEX IF EXISTS public.idx_master_harga_custom_overrides_id;
DROP INDEX IF EXISTS public.idx_project_revisions_approved_by;
DROP INDEX IF EXISTS public.idx_support_tickets_user_id;

-- 2. PENAMBAHAN INDEX FK (COVERING FOREIGN KEYS)
-- ------------------------------------------------------------
-- Dipasang satu per satu untuk menjamin performa Join & Cascades

-- Tabel yang dilaporkan "Unindexed Foreign Keys" (WAJIB ADA demi integritas)
CREATE INDEX IF NOT EXISTS idx_members_selected_location_id ON public.members (selected_location_id);
CREATE INDEX IF NOT EXISTS idx_projects_location_id          ON public.projects (location_id);
CREATE INDEX IF NOT EXISTS idx_daily_progress_report_id      ON public.daily_progress (report_id);
CREATE INDEX IF NOT EXISTS idx_project_photos_report         ON public.project_photos (report_id);
CREATE INDEX IF NOT EXISTS idx_manpower_analysis_item        ON public.manpower_analysis (item_id);
CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_ahsp      ON public.master_ahsp_details (ahsp_id);
CREATE INDEX IF NOT EXISTS idx_master_ahsp_custom_ahsp       ON public.master_ahsp_details_custom (ahsp_id);
CREATE INDEX IF NOT EXISTS idx_master_harga_custom_ovr       ON public.master_harga_custom (overrides_harga_dasar_id);
CREATE INDEX IF NOT EXISTS idx_project_revisions_apprv       ON public.project_revisions (approved_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user          ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_uapo_ahsp_detail_id           ON public.user_ahsp_price_override (ahsp_detail_id);

-- Tabel performa umum (Join sering)
CREATE INDEX IF NOT EXISTS idx_daily_reports_created_by   ON public.daily_reports (created_by);

-- Reload Schema
NOTIFY pgrst, 'reload schema';
