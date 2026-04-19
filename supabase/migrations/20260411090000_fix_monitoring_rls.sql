-- 1. Pembersihan Fungsi Lama
DROP FUNCTION IF EXISTS public.member_can_read_project(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.member_can_write_project(uuid) CASCADE;

-- 2. Definisi Ulang Helper Keamanan (Security Definer)
-- Fungsi Read
CREATE OR REPLACE FUNCTION public.member_can_read_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id 
      AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id 
      AND pm.user_id = auth.uid()
  );
END;
$$;

-- Fungsi Write
CREATE OR REPLACE FUNCTION public.member_can_write_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.members m ON m.user_id = auth.uid()
    WHERE p.id = p_project_id
      AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
      AND m.role IN ('admin', 'pro', 'normal')
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.members m ON m.user_id = auth.uid()
    WHERE pm.project_id = p_project_id 
      AND pm.user_id = auth.uid()
      AND pm.can_write = true
      AND m.role IN ('admin', 'pro', 'normal')
  );
END;
$$;

-- 3. Terapkan RLS Policy ke Modul Monitoring
-- daily_reports
DROP POLICY IF EXISTS daily_reports_select_if_readable ON public.daily_reports;
DROP POLICY IF EXISTS daily_reports_insert_if_writable ON public.daily_reports;
CREATE POLICY daily_reports_select_if_readable ON public.daily_reports FOR SELECT TO authenticated USING (public.member_can_read_project(project_id));
CREATE POLICY daily_reports_insert_if_writable ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (public.member_can_write_project(project_id));

-- daily_progress
DROP POLICY IF EXISTS daily_progress_select_if_readable ON public.daily_progress;
DROP POLICY IF EXISTS daily_progress_insert_if_writable ON public.daily_progress;
CREATE POLICY daily_progress_select_if_readable ON public.daily_progress 
  FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_read_project(r.project_id)));
CREATE POLICY daily_progress_insert_if_writable ON public.daily_progress 
  FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_write_project(r.project_id)));

-- project_photos
DROP POLICY IF EXISTS project_photos_select_if_readable ON public.project_photos;
DROP POLICY IF EXISTS project_photos_insert_if_writable ON public.project_photos;
CREATE POLICY project_photos_select_if_readable ON public.project_photos 
  FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_read_project(r.project_id)));
CREATE POLICY project_photos_insert_if_writable ON public.project_photos 
  FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_write_project(r.project_id)));

-- ahsp_line_snapshots
DROP POLICY IF EXISTS snapshots_select_if_readable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_insert_if_writable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_update_if_writable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_delete_if_writable ON public.ahsp_line_snapshots;

CREATE POLICY snapshots_select_if_readable ON public.ahsp_line_snapshots 
  FOR SELECT TO authenticated 
  USING (public.member_can_read_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));

CREATE POLICY snapshots_insert_if_writable ON public.ahsp_line_snapshots 
  FOR INSERT TO authenticated 
  WITH CHECK (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));

CREATE POLICY snapshots_update_if_writable ON public.ahsp_line_snapshots 
  FOR UPDATE TO authenticated 
  USING (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));

CREATE POLICY snapshots_delete_if_writable ON public.ahsp_line_snapshots 
  FOR DELETE TO authenticated 
  USING (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));

NOTIFY pgrst, 'reload schema';
