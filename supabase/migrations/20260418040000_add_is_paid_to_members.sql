-- ============================================================
-- MIGRATION: Add is_paid distinction to members
-- - Default false (Trial state)
-- - Updated to true on successful payment
-- ============================================================

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
