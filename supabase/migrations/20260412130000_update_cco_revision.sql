-- Add cco_type column to project_cco
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS cco_type TEXT NOT NULL DEFAULT 'CCO-1';

-- Update uniqueness constraint
-- First drop existing unique constraint
ALTER TABLE public.project_cco DROP CONSTRAINT IF EXISTS project_cco_project_id_line_id_key;

-- Add new unique constraint including cco_type
ALTER TABLE public.project_cco ADD CONSTRAINT project_cco_project_id_line_id_cco_type_key UNIQUE(project_id, line_id, cco_type);

-- Refresh schema
NOTIFY pgrst, 'reload schema';
