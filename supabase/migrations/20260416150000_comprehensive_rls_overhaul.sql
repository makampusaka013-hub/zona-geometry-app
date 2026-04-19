-- =============================================================================
-- MIGRATION: 20260416150000_COMPREHENSIVE_RLS_OVERHAUL
-- GOAL: Fix ALL Linter Warnings (Multiple Permissive, Suboptimal Performance)
-- STRATEGY: Drop ALL legacy policies by name and create ONE unified policy per table.
-- =============================================================================

-- 1. CLEANUP & OPTIMIZE: AUTH & PROFILE DATA
-- -----------------------------------------------------------------------------

-- Table: public.active_sessions
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.active_sessions;
DROP POLICY IF EXISTS "active_sessions_manage_v1" ON public.active_sessions;
CREATE POLICY "active_sessions_manage_v1" ON public.active_sessions
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- Table: public.members
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.members;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.members;
DROP POLICY IF EXISTS "View own profile" ON public.members;
DROP POLICY IF EXISTS "members_select_v3" ON public.members;
DROP POLICY IF EXISTS "members_select_v4" ON public.members;
DROP POLICY IF EXISTS "members_select_v5" ON public.members;
CREATE POLICY "members_select_v5" ON public.members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_view_profile(user_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);


-- 2. CLEANUP & OPTIMIZE: PROJECT DATA
-- -----------------------------------------------------------------------------

-- Table: public.projects
DROP POLICY IF EXISTS "Projects select for owners and members" ON public.projects;
DROP POLICY IF EXISTS "projects_select_v3" ON public.projects;
DROP POLICY IF EXISTS "projects_select_v4" ON public.projects;
DROP POLICY IF EXISTS "projects_select_v5" ON public.projects;
CREATE POLICY "projects_select_v5" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR public.is_project_member(id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- Table: public.project_members
DROP POLICY IF EXISTS "Project members select for owners and self" ON public.project_members;
DROP POLICY IF EXISTS "project_members_select_v3" ON public.project_members;
DROP POLICY IF EXISTS "project_members_select_v4" ON public.project_members;
DROP POLICY IF EXISTS "project_members_select_v5" ON public.project_members;
CREATE POLICY "project_members_select_v5" ON public.project_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- Table: public.project_cco & project_mc
DROP POLICY IF EXISTS "Project owners can manage CCO" ON public.project_cco;
DROP POLICY IF EXISTS "project_cco_manage_v2" ON public.project_cco;
CREATE POLICY "project_cco_manage_v2" ON public.project_cco
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

DROP POLICY IF EXISTS "Project owners can manage MC" ON public.project_mc;
DROP POLICY IF EXISTS "project_mc_manage_v2" ON public.project_mc;
CREATE POLICY "project_mc_manage_v2" ON public.project_mc
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- Table: public.project_progress_daily
DROP POLICY IF EXISTS "progress_all_access" ON public.project_progress_daily;
DROP POLICY IF EXISTS "project_progress_daily_manage_v2" ON public.project_progress_daily;
CREATE POLICY "project_progress_daily_manage_v2" ON public.project_progress_daily
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);


-- 3. CLEANUP & OPTIMIZE: AHSP DATA
-- -----------------------------------------------------------------------------

-- Table: public.ahsp_lines
DROP POLICY IF EXISTS "ahsp_lines_select_if_project_readable" ON public.ahsp_lines;
DROP POLICY IF EXISTS "ahsp_lines_manage_v4" ON public.ahsp_lines;
DROP POLICY IF EXISTS "ahsp_lines_select_v4" ON public.ahsp_lines;
DROP POLICY IF EXISTS "ahsp_lines_manage_v5" ON public.ahsp_lines;
DROP POLICY IF EXISTS "ahsp_lines_manage_v6" ON public.ahsp_lines;
CREATE POLICY "ahsp_lines_manage_v6" ON public.ahsp_lines
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_project_member(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
)
WITH CHECK (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_project_member(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- Table: public.project_backup_volume
DROP POLICY IF EXISTS "backup_volume_select_v4" ON public.project_backup_volume;
DROP POLICY IF EXISTS "backup_volume_manage_v4" ON public.project_backup_volume;
DROP POLICY IF EXISTS "backup_volume_manage_v5" ON public.project_backup_volume;
DROP POLICY IF EXISTS "backup_volume_manage_v6" ON public.project_backup_volume;
CREATE POLICY "backup_volume_manage_v6" ON public.project_backup_volume
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_project_member(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
)
WITH CHECK (
  public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_project_member(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- Table: public.master_ahsp
DROP POLICY IF EXISTS "Allow public read access" ON public.master_ahsp;
DROP POLICY IF EXISTS select_master_ahsp ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_select_v2" ON public.master_ahsp;
CREATE POLICY "master_ahsp_select_v2" ON public.master_ahsp
FOR SELECT TO authenticated USING (true);


-- 4. CLEANUP & OPTIMIZE: MASTER DATA & CUSTOM DATA
-- -----------------------------------------------------------------------------

-- Table: public.master_harga_dasar
DROP POLICY IF EXISTS "Admin full access master_harga" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Enable all access for admins" ON public.master_harga_dasar;
DROP POLICY IF EXISTS update_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS select_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS master_harga_dasar_select_v2 ON public.master_harga_dasar;
DROP POLICY IF EXISTS master_harga_dasar_admin_v2 ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select_v3" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_insert_v3" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_update_v3" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_delete_v3" ON public.master_harga_dasar;

CREATE POLICY "master_harga_dasar_select_v3" ON public.master_harga_dasar
FOR SELECT TO authenticated USING (true);

CREATE POLICY "master_harga_dasar_insert_v3" ON public.master_harga_dasar
FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

CREATE POLICY "master_harga_dasar_update_v3" ON public.master_harga_dasar
FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY "master_harga_dasar_delete_v3" ON public.master_harga_dasar
FOR DELETE TO authenticated USING (public.is_app_admin());

-- Cleanup Duplicate Index (if exists)
DROP INDEX IF EXISTS public.idx_mhd_kode; -- Non-unique duplicate of master_harga_dasar_kode_item_key

-- Table: public.master_ahsp_custom
DROP POLICY IF EXISTS ahsp_custom_select ON public.master_ahsp_custom;
DROP POLICY IF EXISTS ahsp_custom_mod ON public.master_ahsp_custom;
DROP POLICY IF EXISTS ahsp_custom_manage_v2 ON public.master_ahsp_custom;
DROP POLICY IF EXISTS "ahsp_custom_manage_v3" ON public.master_ahsp_custom;
CREATE POLICY "ahsp_custom_manage_v3" ON public.master_ahsp_custom
FOR ALL TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_public = true
  OR public.is_app_admin()
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.is_app_admin()
);

-- Table: public.master_ahsp_details
DROP POLICY IF EXISTS select_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS admin_all_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS manage_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS master_ahsp_details_select_v2 ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select_v3" ON public.master_ahsp_details;
CREATE POLICY "master_ahsp_details_select_v3" ON public.master_ahsp_details
FOR SELECT TO authenticated USING (true);

-- Table: public.manpower_analysis
DROP POLICY IF EXISTS "View manpower analysis" ON public.manpower_analysis;
DROP POLICY IF EXISTS manpower_analysis_read_v1 ON public.manpower_analysis;
DROP POLICY IF EXISTS manpower_analysis_admin_v1 ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_select_v2" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_insert_v2" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_update_v2" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_delete_v2" ON public.manpower_analysis;

CREATE POLICY "manpower_analysis_select_v2" ON public.manpower_analysis
FOR SELECT TO authenticated USING (true);

CREATE POLICY "manpower_analysis_insert_v2" ON public.manpower_analysis
FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

CREATE POLICY "manpower_analysis_update_v2" ON public.manpower_analysis
FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY "manpower_analysis_delete_v2" ON public.manpower_analysis
FOR DELETE TO authenticated USING (public.is_app_admin());


-- 5. FINAL RELOAD & NOTIFY
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
