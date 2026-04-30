-- =============================================================================
-- Migration: Fix Custom Tables RLS (Addressing Advisor INFO)
-- Description: Menambahkan policy untuk tabel kustom yang RLS-nya aktif 
--              tapi tidak punya policy.
-- =============================================================================

-- 1. master_ahsp_custom
ALTER TABLE public.master_ahsp_custom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own custom AHSP" ON public.master_ahsp_custom;
CREATE POLICY "Users can manage their own custom AHSP" ON public.master_ahsp_custom
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_app_admin())
  WITH CHECK (user_id = auth.uid() OR is_app_admin());

-- 2. master_ahsp_details_custom
ALTER TABLE public.master_ahsp_details_custom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage details of their own custom AHSP" ON public.master_ahsp_details_custom;
CREATE POLICY "Users can manage details of their own custom AHSP" ON public.master_ahsp_details_custom
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_ahsp_custom h
      WHERE h.id = master_ahsp_details_custom.ahsp_id
      AND (h.user_id = auth.uid() OR is_app_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_ahsp_custom h
      WHERE h.id = master_ahsp_details_custom.ahsp_id
      AND (h.user_id = auth.uid() OR is_app_admin())
    )
  );

-- 3. master_harga_custom
ALTER TABLE public.master_harga_custom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own custom prices" ON public.master_harga_custom;
CREATE POLICY "Users can manage their own custom prices" ON public.master_harga_custom
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_app_admin())
  WITH CHECK (user_id = auth.uid() OR is_app_admin());

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
