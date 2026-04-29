-- Migration: Add Profit and Overhead Persistence Columns
-- Description: Adds overhead_percent to projects and profit_percent to ahsp_lines for explicit persistence.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS overhead_percent NUMERIC DEFAULT 15;
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS profit_percent NUMERIC DEFAULT 15;

-- Update existing data if possible (optional, but good for consistency)
-- This tries to backfill based on existing calculations if the columns were missing
UPDATE public.projects SET overhead_percent = 15 WHERE overhead_percent IS NULL;
UPDATE public.ahsp_lines SET profit_percent = 15 WHERE profit_percent IS NULL;

NOTIFY pgrst, 'reload schema';
