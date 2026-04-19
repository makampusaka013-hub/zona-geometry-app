-- =============================================================================
-- REPAIR: PROJECT PROGRESS DAILY
-- Adds entity_key for reliable UPSERT conflict resolution.
-- =============================================================================

DROP INDEX IF EXISTS public.idx_progress_unique_id;
DROP INDEX IF EXISTS public.idx_progress_unique_name;

ALTER TABLE public.project_progress_daily 
ADD COLUMN IF NOT EXISTS entity_key text;

-- Fill entity_key for existing data (if any)
UPDATE public.project_progress_daily 
SET entity_key = COALESCE(entity_id, entity_name)
WHERE entity_key IS NULL;

-- Make entity_key NOT NULL for consistency (optional but recommended)
-- ALTER TABLE public.project_progress_daily ALTER COLUMN entity_key SET NOT NULL;

-- Create a SINGLE reliable unique index for ON CONFLICT
DROP INDEX IF EXISTS public.idx_progress_unified;
CREATE UNIQUE INDEX idx_progress_unified 
ON public.project_progress_daily (project_id, day_number, entity_type, entity_key);

NOTIFY pgrst, 'reload schema';
