-- =============================================================================
-- Migration: Add persistent Manpower input overrides to ahsp_lines
-- Port dari VBA MODCORE.CalculateWorkersAndDuration:
--   pekerja_input = Prioritas 1: total pekerja yang diinput user (proporsional per koef)
--   durasi_input  = Prioritas 2: target durasi (hari) yang diinput user
-- Jika keduanya NULL → Prioritas 3: defaultWorkers dari frontend state
-- =============================================================================

ALTER TABLE public.ahsp_lines
  ADD COLUMN IF NOT EXISTS pekerja_input INTEGER DEFAULT NULL;

ALTER TABLE public.ahsp_lines
  ADD COLUMN IF NOT EXISTS durasi_input INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.ahsp_lines.pekerja_input IS
  'User override: total pekerja untuk AHSP line ini (Prioritas 1 dalam CalculateWorkersAndDuration). Sistem membagi proporsional berdasarkan rasio koef upah.';

COMMENT ON COLUMN public.ahsp_lines.durasi_input IS
  'User override: target durasi dalam hari untuk AHSP line ini (Prioritas 2 dalam CalculateWorkersAndDuration). Sistem back-calculate jumlah pekerja.';

NOTIFY pgrst, 'reload schema';
