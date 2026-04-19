-- =============================================================================
-- SECURITY HARDENING: MASS SECURITY INVOKER ENFORCEMENT
-- Resolves "Critical SECURITY DEFINER" warnings from Supabase
-- =============================================================================

-- 1. Hardening all known public views
-- Menggunakan ALTER VIEW agar tidak merusak ketergantungan (CASCADE)
-- -----------------------------------------------------------------------------

DO $$ 
DECLARE 
    v_name text;
BEGIN
    -- Daftar view yang akan dikuatkan keamanannya
    FOR v_name IN 
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
    LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_name);
    END LOOP;
END $$;

-- 2. Explicit hardening for core views (assurance)
-- -----------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.view_katalog_ahsp_lengkap SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_katalog_ahsp_custom SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_katalog_ahsp_gabungan SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_analisa_ahsp SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_project_resource_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.view_master_harga_gabungan SET (security_invoker = true);

-- 3. Reload Schema
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
