-- =============================================================================
-- MIGRATION: 20260418000000_ADD_MANUAL_VERIFICATION
-- GOAL: Implement storage for premium manual email verification tokens.
-- =============================================================================

DO $$ 
BEGIN
    -- 1. Tambahkan kolom verification_token
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'verification_token') THEN
        ALTER TABLE public.members ADD COLUMN verification_token TEXT;
    END IF;

    -- 2. Tambahkan kolom is_verified_manual
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'is_verified_manual') THEN
        ALTER TABLE public.members ADD COLUMN is_verified_manual BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Pastikan Role Admin selalu terverifikasi manual secara otomatis
UPDATE public.members SET is_verified_manual = TRUE WHERE role = 'admin';

-- Indeks untuk pencarian token yang cepat
CREATE INDEX IF NOT EXISTS idx_members_verification_token ON public.members(verification_token);
