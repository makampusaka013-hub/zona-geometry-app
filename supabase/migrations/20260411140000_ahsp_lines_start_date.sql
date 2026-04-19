-- ============================================================
-- Migration: Add start_date to ahsp_lines
-- Enables per-item scheduling in the Schedule & Calendar tab
-- ============================================================

ALTER TABLE public.ahsp_lines
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;

ALTER TABLE public.ahsp_lines
  ADD COLUMN IF NOT EXISTS max_durasi INTEGER DEFAULT NULL; -- Optional target duration constraint (days)

-- Index for schedule queries
CREATE INDEX IF NOT EXISTS idx_ahsp_lines_start_date
  ON public.ahsp_lines (project_id, start_date);

-- Comment
COMMENT ON COLUMN public.ahsp_lines.start_date IS
  'Tanggal mulai rencana pelaksanaan item pekerjaan ini (manual input).';
COMMENT ON COLUMN public.ahsp_lines.max_durasi IS
  'Durasi maksimal yang direncanakan (hari kalender). Jika analisa manpower melebihi ini, tampilkan peringatan merah.';
