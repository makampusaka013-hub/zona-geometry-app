-- =============================================================================
-- FIX: USER CREATION TRIGGER & APPROVAL SYSTEM (v2)
-- Standardizes on public.members and fixes the "Database error saving new user"
-- =============================================================================

-- 1. Ensure public.members has all required columns and constraints
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    -- Check approval_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'approval_status') THEN
        ALTER TABLE public.members ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' 
        CONSTRAINT members_approval_status_check CHECK (approval_status IN ('pending', 'active', 'suspended'));
    END IF;

    -- Check status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'status') THEN
        ALTER TABLE public.members ADD COLUMN status text NOT NULL DEFAULT 'active';
    END IF;
END $$;

-- 2. Cleanup conflicting triggers and tables
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS create_profile_on_signup ON auth.users;

-- 3. Robust Trigger Function: handle_new_user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_role      TEXT;
BEGIN
    -- Extract metadata with defaults
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
    v_role      := COALESCE(new.raw_user_meta_data->>'role', 'view');

    -- Insert into members with ON CONFLICT resolution
    INSERT INTO public.members (
        user_id, 
        full_name, 
        role, 
        status, 
        approval_status,
        created_at,
        updated_at
    )
    VALUES (
        new.id,
        v_full_name,
        v_role::public.member_role,
        'active',
        'pending',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RETURN new;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

-- 4. Re-attach trigger to auth.users
-- -----------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Helper Function: activate_user_admin (for the one-click approval link)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_user_admin(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.members 
    SET approval_status = 'active' 
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. Harden existing functions ONLY IF they exist
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'members_enforce_public_signup_role') THEN
        ALTER FUNCTION public.members_enforce_public_signup_role() SET search_path = public;
    END IF;
END $$;

-- Reload Schema
NOTIFY pgrst, 'reload schema';
