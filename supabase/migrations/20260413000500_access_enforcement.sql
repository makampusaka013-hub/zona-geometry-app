-- ============================================================
-- Access Enforcement & Admin Bypass
-- ============================================================

-- 1. Helper function to check if app is accessible by user
CREATE OR REPLACE FUNCTION public.is_app_active()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  SELECT role, approval_status INTO v_role, v_status 
  FROM public.members 
  WHERE user_id = auth.uid();

  -- Admin always bypasses confirmation
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Pro, Normal, and View must be active
  IF v_status = 'active' THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;
GRANT EXECUTE ON FUNCTION public.is_app_active() TO authenticated;

-- 2. Update existing read/write helpers to include is_app_active() check
-- This ensures that even if a user is in a project, they can't read/write if they are suspended/pending
CREATE OR REPLACE FUNCTION public.member_can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_active() 
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = p_project_id
          AND pm.user_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.member_can_write_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_active()
    AND (
      public.is_app_admin()
      OR COALESCE(
        (
          SELECT pm.can_write AND mem.role <> 'view'
          FROM public.project_members pm
          JOIN public.members mem ON mem.user_id = pm.user_id
          WHERE pm.project_id = p_project_id
            AND pm.user_id = auth.uid()
        ),
        false
      )
    );
$$;

-- 3. Update main members policy to ensure users can always see their own row
-- (so they can at least see their status)
DROP POLICY IF EXISTS members_select_own_or_admin ON public.members;
CREATE POLICY members_select_own_or_admin
  ON public.members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

-- 4. Reload schema
NOTIFY pgrst, 'reload schema';
