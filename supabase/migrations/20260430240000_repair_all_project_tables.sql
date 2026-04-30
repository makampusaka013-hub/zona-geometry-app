-- =============================================================================
-- Migration: Repair All Project Tables (Fixing Rekap & Edit)
-- Description: Memastikan semua tabel yang berhubungan dengan proyek
--              menggunakan fungsi RLS terbaru dan benar.
-- =============================================================================

-- 1. project_items
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_items_select" ON public.project_items;
CREATE POLICY "project_items_select" ON public.project_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.created_by = auth.uid() OR is_project_member(p.id) OR is_app_admin())));

DROP POLICY IF EXISTS "project_items_insert" ON public.project_items;
CREATE POLICY "project_items_insert" ON public.project_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.created_by = auth.uid() OR is_project_member(p.id) OR is_app_admin())));

DROP POLICY IF EXISTS "project_items_update" ON public.project_items;
CREATE POLICY "project_items_update" ON public.project_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.created_by = auth.uid() OR is_project_member(p.id) OR is_app_admin())));

-- 2. project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.created_by = auth.uid() OR is_project_member(p.id) OR is_app_admin())));

-- 3. project_revisions
ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_revisions_select" ON public.project_revisions;
CREATE POLICY "project_revisions_select" ON public.project_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.created_by = auth.uid() OR is_project_member(p.id) OR is_app_admin())));

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
