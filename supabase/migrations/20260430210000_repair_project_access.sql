-- =============================================================================
-- Migration: Repair Project Access (Fixing "Data Proyek" Error)
-- Description: Mendefinisikan ulang fungsi is_project_member dan RLS projects
--              yang rusak akibat pembersihan fungsi sebelumnya.
-- =============================================================================

-- 1. Definisikan ulang fungsi is_project_member (Safe Version)
DROP FUNCTION IF EXISTS public.is_project_member(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id 
    AND user_id = auth.uid()
  );
END;
$$;

-- 2. Definisikan ulang fungsi is_app_admin (Safe Version)
DROP FUNCTION IF EXISTS public.is_app_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$;

-- 3. Perbaiki RLS pada tabel projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Akses baca proyek aman" ON public.projects;
CREATE POLICY "Akses baca proyek aman" ON public.projects
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid() OR 
    is_project_member(id) OR
    is_app_admin()
  );

DROP POLICY IF EXISTS "Izinkan user membuat proyek" ON public.projects;
CREATE POLICY "Izinkan user membuat proyek" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 4. Berikan izin eksekusi
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
