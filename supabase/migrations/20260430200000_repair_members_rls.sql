-- =============================================================================
-- Migration: Repair Members RLS (Final Fix)
-- Description: Mendefinisikan ulang RLS members yang rusak akibat CASCADE.
--              Menghapus ketergantungan pada fungsi yang hilang.
-- =============================================================================

-- 1. Aktifkan RLS
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 2. Hapus semua policy yang mungkin sisa atau rusak
DROP POLICY IF EXISTS "Members can view own data" ON public.members;
DROP POLICY IF EXISTS "Allow service-level insertion" ON public.members;
DROP POLICY IF EXISTS "Public access for login" ON public.members;
DROP POLICY IF EXISTS "members_access_vFinal" ON public.members;
DROP POLICY IF EXISTS "definitive_members_policy" ON public.members;

-- 3. Pasang policy BARU yang mandiri (Tanpa fungsi eksternal)
CREATE POLICY "members_self_service_policy" ON public.members
  FOR ALL 
  TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Berikan izin dasar pada tabel
GRANT ALL ON public.members TO authenticated, anon, service_role;

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
