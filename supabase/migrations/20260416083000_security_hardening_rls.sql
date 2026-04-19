-- =============================================================================
-- SECURITY HARDENING: RLS POLICIES ENFORCEMENT
-- Resolves permissive policies and missing RLS for specific tables
-- =============================================================================

-- 1. Hardening master_ahsp_details
-- -----------------------------------------------------------------------------
-- Remove potentially broad policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "select_master_ahsp_details" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "insert_master_ahsp_details" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "update_master_ahsp_details" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "delete_master_ahsp_details" ON public.master_ahsp_details;

ALTER TABLE public.master_ahsp_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_master_ahsp_details ON public.master_ahsp_details;
DROP POLICY IF EXISTS manage_master_ahsp_details ON public.master_ahsp_details;

-- Reading: All authenticated users can read master data
CREATE POLICY select_master_ahsp_details ON public.master_ahsp_details 
FOR SELECT TO authenticated 
USING (true);

-- Modification: Only Admins can modify master data
CREATE POLICY manage_master_ahsp_details ON public.master_ahsp_details 
FOR ALL TO authenticated 
USING ( public.is_app_admin() )
WITH CHECK ( public.is_app_admin() );


-- 2. Hardening project_items (Safe Handling if table exists)
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_items') THEN
        ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "project_items_owner_access" ON public.project_items;
        
        -- Policy: Access if project belongs to user or user is admin
        EXECUTE 'CREATE POLICY project_items_owner_access ON public.project_items 
                 FOR ALL TO authenticated 
                 USING ( 
                    public.is_app_admin() 
                    OR public.member_can_read_project(project_id) 
                 )
                 WITH CHECK ( 
                    public.is_app_admin() 
                    OR public.member_can_write_project(project_id) 
                 )';
    END IF;
END $$;


-- 3. Hardening project_revisions (Safe Handling if table exists)
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_revisions') THEN
        ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "project_revisions_owner_access" ON public.project_revisions;
        
        -- Policy: Access if project belongs to user or user is admin
        EXECUTE 'CREATE POLICY project_revisions_owner_access ON public.project_revisions 
                 FOR ALL TO authenticated 
                 USING ( 
                    public.is_app_admin() 
                    OR public.member_can_read_project(project_id) 
                 )
                 WITH CHECK ( 
                    public.is_app_admin() 
                    OR public.member_can_write_project(project_id) 
                 )';
    END IF;
END $$;

-- 4. Reload Schema
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
