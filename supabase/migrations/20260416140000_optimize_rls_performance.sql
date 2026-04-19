-- =============================================================================
-- MIGRATION: 20260416140000_OPTIMIZE_RLS_PERFORMANCE
-- GOAL: Replace auth.uid() with (SELECT auth.uid()) and consolidate policies
-- =============================================================================

-- 1. ACTIVE_SESSIONS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.active_sessions;
CREATE POLICY "Users can manage own sessions" ON public.active_sessions
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. AHSP_LINES & PROJECT_BACKUP_VOLUME
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS ahsp_lines_select_v4 ON public.ahsp_lines;
DROP POLICY IF EXISTS ahsp_lines_manage_v4 ON public.ahsp_lines;
DROP POLICY IF EXISTS "ahsp_lines_manage_v5" ON public.ahsp_lines;
CREATE POLICY "ahsp_lines_manage_v5" ON public.ahsp_lines
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

DROP POLICY IF EXISTS backup_volume_select_v4 ON public.project_backup_volume;
DROP POLICY IF EXISTS backup_volume_manage_v4 ON public.project_backup_volume;
DROP POLICY IF EXISTS "backup_volume_manage_v5" ON public.project_backup_volume;
CREATE POLICY "backup_volume_manage_v5" ON public.project_backup_volume
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

-- 3. MASTER_AHSP_CUSTOM & DETAILS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS ahsp_custom_select ON public.master_ahsp_custom;
DROP POLICY IF EXISTS ahsp_custom_mod ON public.master_ahsp_custom;
DROP POLICY IF EXISTS "ahsp_custom_manage_v2" ON public.master_ahsp_custom;
CREATE POLICY "ahsp_custom_manage_v2" ON public.master_ahsp_custom
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

DROP POLICY IF EXISTS ahsp_details_custom_all ON public.master_ahsp_details_custom;
DROP POLICY IF EXISTS "ahsp_details_custom_v2" ON public.master_ahsp_details_custom;
CREATE POLICY "ahsp_details_custom_v2" ON public.master_ahsp_details_custom
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.master_ahsp_custom h
    WHERE h.id = ahsp_id
      AND (h.user_id = (SELECT auth.uid()) OR public.is_app_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.master_ahsp_custom h
    WHERE h.id = ahsp_id
      AND (h.user_id = (SELECT auth.uid()) OR public.is_app_admin())
  )
);

-- 4. MASTER_AHSP_DETAILS & MASTER_HARGA_DASAR
-- -----------------------------------------------------------------------------
-- Consolidate master_ahsp_details
DROP POLICY IF EXISTS select_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS admin_all_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select_v2" ON public.master_ahsp_details;
CREATE POLICY "master_ahsp_details_select_v2" ON public.master_ahsp_details
FOR SELECT TO authenticated USING (true);

-- Consolidate master_harga_dasar (Fix Multiple Permissive)
DROP POLICY IF EXISTS "Admin full access master_harga" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Enable all access for admins" ON public.master_harga_dasar;
DROP POLICY IF EXISTS update_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS select_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS insert_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS delete_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select_v2" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_admin_v2" ON public.master_harga_dasar;

CREATE POLICY "master_harga_dasar_select_v2" ON public.master_harga_dasar
FOR SELECT TO authenticated USING (true);

CREATE POLICY "master_harga_dasar_admin_v2" ON public.master_harga_dasar
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

-- 5. MEMBERS (Merge multiple view policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.members;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.members;
DROP POLICY IF EXISTS "View own profile" ON public.members;
DROP POLICY IF EXISTS "members_select_v3" ON public.members;
DROP POLICY IF EXISTS "members_select_v4" ON public.members;
CREATE POLICY "members_select_v4" ON public.members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_view_profile(user_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- 6. MANPOWER_ANALYSIS (Fix user_id column error)
-- -----------------------------------------------------------------------------
ALTER TABLE public.manpower_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own manpower analysis" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_read_v1" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_admin_v1" ON public.manpower_analysis;

CREATE POLICY "manpower_analysis_read_v1" ON public.manpower_analysis
FOR SELECT TO authenticated USING (true);

CREATE POLICY "manpower_analysis_admin_v1" ON public.manpower_analysis
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

-- 7. PROJECTS & PROJECT_MEMBERS (General optimization)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS projects_select_v3 ON public.projects;
DROP POLICY IF EXISTS "projects_select_v4" ON public.projects;
CREATE POLICY "projects_select_v4" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR public.is_project_member(id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

DROP POLICY IF EXISTS project_members_select_v3 ON public.project_members;
DROP POLICY IF EXISTS "project_members_select_v4" ON public.project_members;
CREATE POLICY "project_members_select_v4" ON public.project_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_project_owner(project_id, (SELECT auth.uid()))
  OR public.is_app_admin()
);

-- 8. Final Reload
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
