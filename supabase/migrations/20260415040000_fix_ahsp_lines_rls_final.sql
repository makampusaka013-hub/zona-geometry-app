-- ============================================================
-- HARMONIZE RLS POLICIES FOR PROJECT DATA
-- Tables: ahsp_lines, project_backup_volume
-- Uses stabilized mediator functions to avoid recursion
-- ============================================================

-- 1. PREPARE TABLES
ALTER TABLE public.ahsp_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_backup_volume ENABLE ROW LEVEL SECURITY;

-- 2. CLEANUP OLD POLICIES (ahsp_lines)
DROP POLICY IF EXISTS ahsp_lines_select_if_project_readable ON public.ahsp_lines;
DROP POLICY IF EXISTS ahsp_lines_insert_if_project_writable ON public.ahsp_lines;
DROP POLICY IF EXISTS ahsp_lines_update_if_project_writable ON public.ahsp_lines;
DROP POLICY IF EXISTS ahsp_lines_delete_if_project_writable ON public.ahsp_lines;
DROP POLICY IF EXISTS ahsp_lines_update_if_writable ON public.ahsp_lines; -- Existing issue policy

-- 3. CLEANUP OLD POLICIES (project_backup_volume)
DROP POLICY IF EXISTS "Users can view backup volumes of their projects" ON public.project_backup_volume;
DROP POLICY IF EXISTS "Users can manage backup volumes of their projects" ON public.project_backup_volume;

-- 4. NEW STABILIZED POLICIES FOR ahsp_lines
-- SELECT: Owner, Members, Admin
CREATE POLICY "ahsp_lines_select_v4" ON public.ahsp_lines
FOR SELECT TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
);

-- ALL (Insert/Update/Delete): Owner, Authorized Members, Admin
-- Note: Check is performed for Insert/Update
CREATE POLICY "ahsp_lines_manage_v4" ON public.ahsp_lines
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
);

-- 5. NEW STABILIZED POLICIES FOR project_backup_volume
-- SELECT: Consistent with ahsp_lines
CREATE POLICY "backup_volume_select_v4" ON public.project_backup_volume
FOR SELECT TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
);

-- ALL: Consistent with ahsp_lines
CREATE POLICY "backup_volume_manage_v4" ON public.project_backup_volume
FOR ALL TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
  OR public.is_app_admin()
);

-- 6. RELOAD POSTGREST
NOTIFY pgrst, 'reload schema';
