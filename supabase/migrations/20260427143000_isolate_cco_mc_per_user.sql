-- Migration: Isolate CCO and MC per user
-- Date: 2026-04-27

-- 1. Update project_cco
-- Ensure created_by exists (it should from 20260414230000_cco_multi_version_overhaul.sql)
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Remove old unique constraints
ALTER TABLE public.project_cco DROP CONSTRAINT IF EXISTS project_cco_project_version_line_unique;
ALTER TABLE public.project_cco DROP CONSTRAINT IF EXISTS project_cco_project_id_line_id_cco_type_key;

-- Add new constraint including created_by to allow each user to have their own draft
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_cco_user_version_line_unique') THEN
        ALTER TABLE public.project_cco ADD CONSTRAINT project_cco_user_version_line_unique UNIQUE (project_id, created_by, cco_type, line_id);
    END IF;
END $$;

-- 2. Update project_mc
-- Add created_by column
ALTER TABLE public.project_mc ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Remove old unique constraint
ALTER TABLE public.project_mc DROP CONSTRAINT IF EXISTS project_mc_project_id_line_id_mc_type_key;

-- Add new constraint including created_by
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_mc_user_type_line_unique') THEN
        ALTER TABLE public.project_mc ADD CONSTRAINT project_mc_user_type_line_unique UNIQUE (project_id, created_by, mc_type, line_id);
    END IF;
END $$;

-- 3. Standardize column names for ordering (if missing)
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 1;
ALTER TABLE public.project_mc ADD COLUMN IF NOT EXISTS mc_number INTEGER DEFAULT 0;

-- 4. Update RLS Policies to be more comprehensive
-- project_cco
DROP POLICY IF EXISTS "project_cco_manage_v2" ON public.project_cco;
DROP POLICY IF EXISTS "Project owners can manage CCO" ON public.project_cco;

CREATE POLICY "project_cco_owner_manage" ON public.project_cco
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_cco.project_id AND user_id = auth.uid())
    )
    WITH CHECK (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_cco.project_id AND user_id = auth.uid())
    );

-- project_mc
DROP POLICY IF EXISTS "project_mc_manage_v2" ON public.project_mc;
DROP POLICY IF EXISTS "Project owners can manage MC" ON public.project_mc;

CREATE POLICY "project_mc_owner_manage" ON public.project_mc
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_mc.project_id AND user_id = auth.uid())
    )
    WITH CHECK (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_mc.project_id AND user_id = auth.uid())
    );

-- 5. Reload PostgREST
NOTIFY pgrst, 'reload schema';
