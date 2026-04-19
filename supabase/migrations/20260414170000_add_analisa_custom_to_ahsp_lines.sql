-- ============================================================
-- FIX: Missing analisa_custom column in ahsp_lines
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.ahsp_lines'::regclass
    AND attname = 'analisa_custom'
  ) THEN
    ALTER TABLE public.ahsp_lines ADD COLUMN analisa_custom jsonb DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN public.ahsp_lines.analisa_custom IS 'Stores local AHSP breakdown details for custom/lumpsum items.';
  END IF;
END $$;

-- Ensure schema cache is reloaded
NOTIFY pgrst, 'reload schema';
