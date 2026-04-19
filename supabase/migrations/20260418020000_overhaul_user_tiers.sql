-- ============================================================
-- MIGRATION: Overhaul User Tiers
-- - Add 'advance' role to member_role ENUM
-- - Migrate all 'view' users to 'normal'
-- - Update default role to 'normal'
-- - Update signup trigger to use 'normal'
-- ============================================================

-- 1. Add 'advance' to the ENUM (safe, non-destructive)
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'advance';

-- 2. Migrate all existing 'view' users to 'normal'
UPDATE public.members
SET role = 'normal'
WHERE role = 'view';

-- 3. Update the default role on the members table to 'normal'
ALTER TABLE public.members
  ALTER COLUMN role SET DEFAULT 'normal';

-- 4. Update the signup enforcement trigger to assign 'normal' instead of 'view'
CREATE OR REPLACE FUNCTION public.members_enforce_public_signup_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent a user from self-promoting to admin/pro/advance on signup
  IF new.user_id = auth.uid() THEN
    new.role := 'normal';
  END IF;
  RETURN new;
END;
$$;

-- 5. Update the auto-activate API function to set 'normal' as well (in RPC if present)
-- The activate API calls a DB update directly - so the default above covers new inserts.
-- Existing RPC: if there is a get_user_account_expiry or activate RPC, patch it below.

-- Patch any 'view' fallback references in the members table for existing users
-- (This is idempotent - if already done, it's a no-op)
UPDATE public.members
SET role = 'normal'
WHERE role = 'view';
