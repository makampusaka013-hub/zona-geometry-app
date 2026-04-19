-- =============================================================================
-- MIGRATION: 20260417180000_PERFORMANCE_INDEXING_FINAL
-- GOAL: Resolve all "Unindexed foreign keys" audit warnings for production performance.
-- =============================================================================

-- 1. CORE PROJECT & AHSP INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ahsp_lines_project_id 
    ON public.ahsp_lines (project_id);

CREATE INDEX IF NOT EXISTS idx_ahsp_lines_master_ahsp_id 
    ON public.ahsp_lines (master_ahsp_id);

CREATE INDEX IF NOT EXISTS idx_projects_location_id 
    ON public.projects (location_id);

CREATE INDEX IF NOT EXISTS idx_members_selected_location_id 
    ON public.members (selected_location_id);

-- 2. MONITORING & PROGRESS INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id 
    ON public.daily_reports (project_id);

CREATE INDEX IF NOT EXISTS idx_daily_progress_report_id 
    ON public.daily_progress (report_id);

CREATE INDEX IF NOT EXISTS idx_project_photos_report_id 
    ON public.project_photos (report_id);

-- Manpower analysis index skipped (column name verification pending)

-- 3. CUSTOM HSP & OVERRIDES INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_master_ahsp_custom_user_id 
    ON public.master_ahsp_custom (user_id);

CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_custom_ahsp_id 
    ON public.master_ahsp_details_custom (ahsp_id);

CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_custom_item_id 
    ON public.master_ahsp_details_custom (item_id);

CREATE INDEX IF NOT EXISTS idx_uapo_user_id 
    ON public.user_ahsp_price_override (user_id);

CREATE INDEX IF NOT EXISTS idx_uapo_ahsp_detail_id 
    ON public.user_ahsp_price_override (ahsp_detail_id);

-- 4. MISCELLANEOUS INFRASTRUCTURE INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id 
    ON public.active_sessions (user_id);

-- Workspaces table was deprecated and removed in previous migrations
-- CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON public.workspaces (created_by);

CREATE INDEX IF NOT EXISTS idx_project_members_assigned_by 
    ON public.project_members (assigned_by);

-- 5. CCO & MC INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_project_cco_line_id 
    ON public.project_cco (line_id);

CREATE INDEX IF NOT EXISTS idx_project_mc_line_id 
    ON public.project_mc (line_id);

-- 6. RELOAD SCHEMA
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
