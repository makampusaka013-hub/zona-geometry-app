-- =============================================================================
-- SECURITY GROUND TRUTH: DYNAMIC POLICY RESET & OPTIMIZATION (v3)
-- Resolves: "Multiple Permissive Policies" & "Auth RLS Initialization Plan"
-- Targets: members, projects, project_members, manpower_analysis, master_harga_dasar, master_harga_custom
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_table_names TEXT[] := ARRAY[
        'members', 
        'projects', 
        'project_members', 
        'manpower_analysis', 
        'master_harga_dasar', 
        'master_harga_custom'
    ];
    v_target_table TEXT;
BEGIN
    -- 1. DYNAMIC NUCLEAR WIPE
    -- Drops every single policy on target tables to clear collision clutter.
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

-- 2. RE-APPLY DEFINITIVE OPTIMIZED POLICIES (vFinal)
-- Using (SELECT auth.uid()) pattern to resolve "Auth RLS Initialization Plan".
-- -----------------------------------------------------------------------------

-- [members]
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_access_vFinal" ON public.members
    FOR ALL TO authenticated 
    USING (
        user_id = (SELECT auth.uid()) 
        OR public.is_app_admin()
        OR (to_regproc('public.can_view_profile') IS NOT NULL AND public.can_view_profile(user_id, (SELECT auth.uid())))
    )
    WITH CHECK (
        user_id = (SELECT auth.uid()) 
        OR public.is_app_admin()
    );

-- [projects]
-- Schema 20260406160000 uses user_id/created_by.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_access_vFinal" ON public.projects
    FOR ALL TO authenticated 
    USING (
        public.is_app_admin() 
        OR user_id = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
        OR public.member_can_read_project(id)
    )
    WITH CHECK (
        public.is_app_admin() 
        OR user_id = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
        OR public.member_can_write_project(id)
    );

-- [project_members]
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_access_vFinal" ON public.project_members
    FOR ALL TO authenticated 
    USING (
        public.is_app_admin()
        OR user_id = (SELECT auth.uid())
        OR public.member_can_read_project(project_id)
    )
    WITH CHECK (
        public.is_app_admin()
        -- Only project owner or admin can manage members
        OR EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = project_id 
              AND (p.user_id = (SELECT auth.uid()) OR p.created_by = (SELECT auth.uid()))
        )
    );

-- [manpower_analysis] (Master Data)
ALTER TABLE public.manpower_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manpower_analysis_access_vFinal" ON public.manpower_analysis
    FOR ALL TO authenticated
    USING ( true )
    WITH CHECK ( public.is_app_admin() );

-- [master_harga_dasar] (Reference Data)
ALTER TABLE public.master_harga_dasar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_harga_dasar_access_vFinal" ON public.master_harga_dasar
    FOR ALL TO authenticated
    USING ( true )
    WITH CHECK ( public.is_app_admin() );

-- [master_harga_custom] (User Personal Data)
ALTER TABLE public.master_harga_custom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_harga_custom_access_vFinal" ON public.master_harga_custom
    FOR ALL TO authenticated
    USING ( 
        user_id = (SELECT auth.uid()) 
        OR public.is_app_admin() 
    )
    WITH CHECK ( 
        user_id = (SELECT auth.uid()) 
        OR public.is_app_admin() 
    );

-- 3. FINAL SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';
