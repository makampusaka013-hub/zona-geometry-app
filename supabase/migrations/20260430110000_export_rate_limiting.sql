-- =============================================================================
-- Migration: Export Rate Limiting and Task Tracking
-- Objective: Prevent server overload and abuse of Excel export functionality
-- =============================================================================

-- 1. Add tracking columns to members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS last_export_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS export_count_today INTEGER DEFAULT 0;

-- 2. Create export_tasks table for task management (Job Queue)
CREATE TABLE IF NOT EXISTS public.export_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.members(user_id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.export_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own export tasks"
  ON public.export_tasks FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Function to check and increment export rate limit
CREATE OR REPLACE FUNCTION public.check_and_increment_export_limit()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_last_export TIMESTAMP WITH TIME ZONE;
  v_count INTEGER;
  v_limit INTEGER := 50; -- Limit 50 exports per day
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT last_export_at, export_count_today INTO v_last_export, v_count
  FROM members WHERE user_id = v_user_id;

  -- Reset count if it's a new day
  IF v_last_export IS NULL OR v_last_export < date_trunc('day', now()) THEN
    v_count := 0;
  END IF;

  IF v_count >= v_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE members
  SET 
    last_export_at = now(),
    export_count_today = v_count + 1
  WHERE user_id = v_user_id;

  RETURN TRUE;
END;
$$;

NOTIFY pgrst, 'reload schema';
