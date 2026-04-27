-- Migration: Isolate Project Progress Daily per user
-- Date: 2026-04-27

-- 1. Add created_by column if not exists
ALTER TABLE public.project_progress_daily ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Update the unique constraint to include created_by
-- First, drop the existing unified index
DROP INDEX IF EXISTS idx_progress_unique_composite;

-- Create the new unified unique index including created_by
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_user_composite 
  ON public.project_progress_daily (project_id, day_number, entity_type, entity_key, created_by);

-- 3. Update RLS Policies
DROP POLICY IF EXISTS progress_all_access ON public.project_progress_daily;

CREATE POLICY "progress_owner_manage" ON public.project_progress_daily
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_progress_daily.project_id AND user_id = auth.uid())
    )
    WITH CHECK (
        created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_progress_daily.project_id AND user_id = auth.uid())
    );

-- 4. Reload PostgREST
NOTIFY pgrst, 'reload schema';
