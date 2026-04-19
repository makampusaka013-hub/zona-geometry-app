-- Add uraian_custom column to ahsp_lines
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS uraian_custom text;
