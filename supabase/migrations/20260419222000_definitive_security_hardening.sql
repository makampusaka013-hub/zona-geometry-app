-- =============================================================================
-- SECURITY HARDENING: FINAL SECURITY INVOKER ENFORCEMENT
-- Target: Resolve Supabase Security Advisor warnings for SD views
-- =============================================================================

-- 1. Force SECURITY INVOKER on all flagged views (PostgreSQL 15+ syntax)
-- -----------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.view_katalog_ahsp_lengkap SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_katalog_ahsp_custom SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_katalog_ahsp_gabungan SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_analisa_ahsp SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_project_resource_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_master_harga_gabungan SET (security_invoker = true);

-- 2. Ensure Master Tables are Publicly Readable via RLS
-- This ensures that SECURITY INVOKER views work for everyone (Trial/Basic)
-- -----------------------------------------------------------------------------

-- Enable RLS just in case it was missed
ALTER TABLE public.master_ahsp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_ahsp_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_harga_dasar ENABLE ROW LEVEL SECURITY;

-- Create Public Read Policies (Allow anyone to see official catalog)
DROP POLICY IF EXISTS "Public Read Access for master_ahsp" ON public.master_ahsp;
CREATE POLICY "Public Read Access for master_ahsp" 
ON public.master_ahsp FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access for master_ahsp_details" ON public.master_ahsp_details;
CREATE POLICY "Public Read Access for master_ahsp_details" 
ON public.master_ahsp_details FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access for master_harga_dasar" ON public.master_harga_dasar;
CREATE POLICY "Public Read Access for master_harga_dasar" 
ON public.master_harga_dasar FOR SELECT USING (true);

-- 3. Harden search_path for all SECURITY DEFINER functions (Prevention)
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.save_project_transactional(UUID, JSONB, JSONB) SET search_path = public;
ALTER FUNCTION public.get_ahsp_catalog_v2(UUID, TEXT, TEXT, BOOLEAN, INT, INT) SET search_path = public;

-- 4. Reload Schema for UI reflect
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
