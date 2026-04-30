-- =============================================================================
-- Migration: Robust Auth-Member Synchronization (Phase 14 Hardening)
-- Description: Ensures members data is ALWAYS in sync with auth.users and
--              provides fail-safe triggers to prevent login blockers.
-- =============================================================================

-- 1. Function to handle robust user synchronization (ULTRA SECURE VERSION)
CREATE OR REPLACE FUNCTION public.handle_new_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai sistem (Bypass RLS)
SET search_path = public -- Kunci skema (Anti-Manipulation)
AS $$
BEGIN
    -- UPSERT: Create or update member
    INSERT INTO public.members (user_id, email, full_name, role, approval_status, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'normal'),
        CASE 
            WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'pro') THEN 'active'::text
            ELSE 'pending'::text
        END,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- 2. Re-attach the trigger cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_sync();

-- 3. Security Hardening & Precise RLS (No Over-permissive rules)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Policy: User bisa baca datanya sendiri
DROP POLICY IF EXISTS "Members can view own data" ON public.members;
CREATE POLICY "Members can view own data" ON public.members
  FOR SELECT TO authenticated, anon
  USING (user_id = auth.uid());

-- Policy: Frontend fallback (Hanya jika trigger gagal, user bisa insert datanya sendiri)
DROP POLICY IF EXISTS "Allow service-level insertion" ON public.members;
CREATE POLICY "Allow service-level insertion" ON public.members
  FOR INSERT TO authenticated, anon
  WITH CHECK (user_id = auth.uid());

-- Revoke direct execution from API for trigger functions (Linter Compliance)
REVOKE EXECUTE ON FUNCTION public.handle_new_user_sync() FROM PUBLIC, anon, authenticated;

-- Ensure online status check is available for login flow
REVOKE EXECUTE ON FUNCTION public.check_user_online_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_online_status(TEXT) TO authenticated, anon;

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
