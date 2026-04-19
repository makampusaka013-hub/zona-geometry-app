-- =============================================================================
-- Migration: Add labor_settings to projects for Manpower Effectiveness calculation
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS labor_settings jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.projects.labor_settings IS
  'Pengaturan efektivitas dan kuantitas per peran tenaga kerja. Format: {"Role Uraian": {"count": 1, "eff": 100}}';

NOTIFY pgrst, 'reload schema';
