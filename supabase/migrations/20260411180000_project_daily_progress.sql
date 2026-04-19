-- =============================================================================
-- TABLE: PROJECT PROGRESS DAILY
-- Stores daily achievements and resource usage for project monitoring.
-- Supports 365 days of data per item/resource.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_progress_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Type of data being tracked
  -- 'ahsp_item'     -> Physical progress (Volume)
  -- 'resource'      -> Resource usage (Bahan, Alat, Tenaga from catalog)
  -- 'custom_labor'  -> External roles (PPK, Inspektorat, etc.)
  entity_type text NOT NULL CHECK (entity_type IN ('ahsp_item', 'resource', 'custom_labor')),
  
  -- ID or Key identifying the row
  entity_id text,
  
  -- Human readable name
  entity_name text,
  
  -- The specific day offset from project_start_date (1-365)
  day_number integer NOT NULL CHECK (day_number >= 1 AND day_number <= 365),
  
  -- The value recorded (Volume or Quantity)
  val numeric DEFAULT 0,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraints to prevent duplicate entries for the same entity on the same day
-- 1. For AHSP items and Catalog resources (using entity_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique_id 
  ON public.project_progress_daily (project_id, day_number, entity_type, entity_id) 
  WHERE entity_id IS NOT NULL;

-- 2. For custom labels (using entity_name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique_name 
  ON public.project_progress_daily (project_id, day_number, entity_type, entity_name) 
  WHERE entity_id IS NULL;

-- Enable RLS
ALTER TABLE public.project_progress_daily ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see/modify progress for projects they own
CREATE POLICY progress_all_access ON public.project_progress_daily
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER project_progress_daily_updated_at
  BEFORE UPDATE ON public.project_progress_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
