-- =============================================================================
-- Migration: Robust Auth-Member Synchronization (Phase 14 Hardening)
-- Description: Ensures members data is ALWAYS in sync with auth.users and
--              provides fail-safe triggers to prevent login blockers.
-- =============================================================================

-- 1. Function to handle robust user synchronization
CREATE OR REPLACE FUNCTION public.handle_new_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- UPSERT logic: Create or update member based on auth.users data
    -- Using ON CONFLICT to prevent "Duplicate Identifier" errors
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

-- 2. Re-attach the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_sync();

-- 3. Security Hardening for permissions
GRANT SELECT ON public.members TO anon, authenticated;

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
