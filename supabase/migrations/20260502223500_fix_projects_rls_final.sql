-- =============================================================================
-- Migration: Enable Project Update and Delete Policies
-- Description: Menambahkan RLS yang hilang agar user bisa edit identitas
--              dan menghapus proyek mereka sendiri.
-- =============================================================================

-- 1. Pastikan RLS Aktif
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Kebijakan UPDATE (Untuk Identitas Proyek)
DROP POLICY IF EXISTS "Izinkan update proyek" ON public.projects;
CREATE POLICY "Izinkan update proyek" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() OR 
    is_app_admin()
  )
  WITH CHECK (
    created_by = auth.uid() OR 
    is_app_admin()
  );

-- 3. Kebijakan DELETE (Untuk Hapus Proyek)
DROP POLICY IF EXISTS "Izinkan hapus proyek" ON public.projects;
CREATE POLICY "Izinkan hapus proyek" ON public.projects
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR 
    is_app_admin()
  );

-- 4. Reload
NOTIFY pgrst, 'reload schema';
