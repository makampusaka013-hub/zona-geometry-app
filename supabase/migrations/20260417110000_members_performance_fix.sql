-- =============================================================================
-- PERFORMANCE HARDENING: MEMBERS & MASTER TABLES DYNAMIC CLEANUP
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_table_names TEXT[] := ARRAY['members', 'manpower_analysis', 'master_harga_dasar', 'master_harga_custom'];
    v_target_table TEXT;
BEGIN
    -- 1. DYNAMIC POLICY CLEANUP
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

-- 2. RE-APPLY OPTIMIZED V3 POLICIES
-- -----------------------------------------------------------------------------

-- members (Profile/System Data)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_v4" ON public.members
    FOR SELECT TO authenticated 
    USING ( 
        user_id = (SELECT auth.uid()) 
        OR public.can_view_profile(user_id, (SELECT auth.uid())) 
        OR public.is_app_admin() 
    );
CREATE POLICY "members_insert_self_v4" ON public.members
    FOR INSERT TO authenticated 
    WITH CHECK ( user_id = (SELECT auth.uid()) );
CREATE POLICY "members_manage_admin_v4" ON public.members
    FOR ALL TO authenticated 
    USING ( public.is_app_admin() );

-- manpower_analysis
ALTER TABLE public.manpower_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manpower_analysis_select_v4" ON public.manpower_analysis
    FOR SELECT TO authenticated USING ( true );
CREATE POLICY "manpower_analysis_manage_v4" ON public.manpower_analysis
    FOR ALL TO authenticated USING ( public.is_app_admin() );

-- master_harga_dasar
ALTER TABLE public.master_harga_dasar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_harga_dasar_select_v4" ON public.master_harga_dasar
    FOR SELECT TO authenticated USING ( true );
CREATE POLICY "master_harga_dasar_manage_v4" ON public.master_harga_dasar
    FOR ALL TO authenticated USING ( public.is_app_admin() );

-- master_harga_custom
ALTER TABLE public.master_harga_custom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_harga_custom_select_v4" ON public.master_harga_custom
    FOR SELECT TO authenticated USING ( user_id = (SELECT auth.uid()) OR public.is_app_admin() );
CREATE POLICY "master_harga_custom_manage_v4" ON public.master_harga_custom
    FOR ALL TO authenticated USING ( user_id = (SELECT auth.uid()) OR public.is_app_admin() );

-- 3. Final Schema Reload
NOTIFY pgrst, 'reload schema';
