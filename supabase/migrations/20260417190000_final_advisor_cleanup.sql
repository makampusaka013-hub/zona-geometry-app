-- =============================================================================
-- FINAL SECURITY CLEANUP: RESOLVING ADVISOR PERMISSIVE POLICY WARNINGS
-- Targets: locations, user_ahsp_price_override, manpower_analysis
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_table_names TEXT[] := ARRAY['locations', 'user_ahsp_price_override', 'manpower_analysis'];
    v_target_table TEXT;
BEGIN
    -- 1. NUCLEAR WIPE of existing policies on target tables
    FOREACH v_target_table IN ARRAY v_table_names
    LOOP
        FOR r IN (
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = v_target_table
        )
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, v_target_table);
        END LOOP;
    END LOOP;
END $$;

-- 2. RE-APPLY HARDENED, NON-OVERLAPPING POLICIES
-- We separate SELECT from other DML actions to avoid "Permissive" warnings.
-- -----------------------------------------------------------------------------

-- [locations]
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_select_policy_vFinal" ON public.locations
    FOR SELECT TO authenticated 
    USING ( true );

CREATE POLICY "locations_insert_admin_vFinal" ON public.locations
    FOR INSERT TO authenticated 
    WITH CHECK ( public.is_app_admin() );

CREATE POLICY "locations_update_admin_vFinal" ON public.locations
    FOR UPDATE TO authenticated 
    USING ( public.is_app_admin() )
    WITH CHECK ( public.is_app_admin() );

CREATE POLICY "locations_delete_admin_vFinal" ON public.locations
    FOR DELETE TO authenticated 
    USING ( public.is_app_admin() );

-- [user_ahsp_price_override]
ALTER TABLE public.user_ahsp_price_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uapo_select_vFinal" ON public.user_ahsp_price_override
    FOR SELECT TO authenticated
    USING ( user_id = (SELECT auth.uid()) );

CREATE POLICY "uapo_insert_vFinal" ON public.user_ahsp_price_override
    FOR INSERT TO authenticated
    WITH CHECK ( user_id = (SELECT auth.uid()) );

CREATE POLICY "uapo_update_vFinal" ON public.user_ahsp_price_override
    FOR UPDATE TO authenticated
    USING ( user_id = (SELECT auth.uid()) )
    WITH CHECK ( user_id = (SELECT auth.uid()) );

CREATE POLICY "uapo_delete_vFinal" ON public.user_ahsp_price_override
    FOR DELETE TO authenticated
    USING ( user_id = (SELECT auth.uid()) );

-- [manpower_analysis]
ALTER TABLE public.manpower_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manpower_analysis_select_vFinal" ON public.manpower_analysis
    FOR SELECT TO authenticated 
    USING ( true );

CREATE POLICY "manpower_analysis_insert_admin_vFinal" ON public.manpower_analysis
    FOR INSERT TO authenticated 
    WITH CHECK ( public.is_app_admin() );

CREATE POLICY "manpower_analysis_update_admin_vFinal" ON public.manpower_analysis
    FOR UPDATE TO authenticated 
    USING ( public.is_app_admin() )
    WITH CHECK ( public.is_app_admin() );

CREATE POLICY "manpower_analysis_delete_admin_vFinal" ON public.manpower_analysis
    FOR DELETE TO authenticated 
    USING ( public.is_app_admin() );

-- 3. FINAL SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';
