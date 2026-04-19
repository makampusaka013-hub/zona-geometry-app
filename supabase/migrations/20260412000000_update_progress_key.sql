-- =============================================================================
-- Migration: Add entity_key to project_progress_daily
-- Resolve Save Failure by unifying the unique constraint
-- =============================================================================

DO $$ 
BEGIN
    -- Add column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='project_progress_daily' AND column_name='entity_key') THEN
        ALTER TABLE public.project_progress_daily ADD COLUMN entity_key text;
    END IF;
END $$;

-- Populate entity_key for existing data
UPDATE public.project_progress_daily 
SET entity_key = COALESCE(entity_id, entity_name)
WHERE entity_key IS NULL;

-- Make it NOT NULL for future data
ALTER TABLE public.project_progress_daily ALTER COLUMN entity_key SET NOT NULL;

-- Drop old indices
DROP INDEX IF EXISTS idx_progress_unique_id;
DROP INDEX IF EXISTS idx_progress_unique_name;

-- Create new unified unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique_composite 
  ON public.project_progress_daily (project_id, day_number, entity_type, entity_key);

NOTIFY pgrst, 'reload schema';
