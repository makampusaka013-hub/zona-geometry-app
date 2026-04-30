-- =============================================================================
-- Migration: Cleanup Members RLS Policies
-- Description: Removes overlapping and confusing policies on the members table
--              to prevent "Database error granting user" during login.
-- =============================================================================

-- 1. Disable RLS temporarily to clean up
ALTER TABLE public.members DISABLE ROW LEVEL SECURITY;

-- 2. DROP all existing policies on members to start clean
DROP POLICY IF EXISTS "Members can view own data" ON public.members;
DROP POLICY IF EXISTS "Allow service-level insertion" ON public.members;
DROP POLICY IF EXISTS "Public access for login" ON public.members;
DROP POLICY IF EXISTS "members_access_vFinal" ON public.members;

-- 3. Create ONE definitive policy for members
-- Policy: Users can manage their own profile, Admins can manage everything
DROP POLICY IF EXISTS "definitive_members_policy" ON public.members;
CREATE POLICY "definitive_members_policy" ON public.members
  FOR ALL 
  TO authenticated, anon
  USING (
    (user_id = auth.uid()) OR 
    (EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = auth.uid() AND m.role = 'admin'))
  )
  WITH CHECK (
    (user_id = auth.uid()) OR 
    (EXISTS (SELECT 1 FROM public.members m WHERE m.user_id = auth.uid() AND m.role = 'admin'))
  );

-- 4. Re-enable RLS
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 5. Advisor Center Fixes: Secure sensitive functions
-- Fix: Function Search Path Mutable & Public Execution of SECURITY DEFINER functions

-- 5.1 handle_new_user_sync (Trigger only, should not be callable via API)
REVOKE EXECUTE ON FUNCTION public.handle_new_user_sync() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user_sync() SET search_path = public;

-- 5.2 update_user_heartbeat (Used by app, keep executable but lock search_path)
ALTER FUNCTION public.update_user_heartbeat(TEXT, TEXT) SET search_path = public;

-- 5.3 check_user_online_status (Used by login, keep executable but lock search_path)
ALTER FUNCTION public.check_user_online_status(TEXT) SET search_path = public;

-- 6. Reload Schema
NOTIFY pgrst, 'reload schema';
