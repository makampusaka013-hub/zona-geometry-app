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

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
