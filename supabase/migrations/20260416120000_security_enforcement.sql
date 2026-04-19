-- =============================================================================
-- SYSTEM: SECURITY HARDENING FOR TRIAL & PRO EXPIRATION
-- This script updates RLS functions to enforce access control based on trial/pro status.
-- =============================================================================

-- 1. Ensure is_member_active is robust
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_member_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members 
    WHERE user_id = auth.uid() 
    AND (
      role = 'admin'                    -- Admins never expire
      OR expired_at IS NULL             -- Safety for unassigned dates
      OR expired_at > NOW()             -- Within trial or pro period
    )
    AND status = 'active'               -- Not manually banned
  );
$$;

-- 2. Update existing RLS helper functions to include activity check
-- -----------------------------------------------------------------------------

-- Update member_can_write_project
CREATE OR REPLACE FUNCTION public.member_can_write_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Must be active to write anything
  SELECT public.is_member_active() AND (
    public.is_app_admin()
    OR COALESCE(
      (
        SELECT pm.can_write AND mem.role <> 'view'
        FROM public.project_members pm
        JOIN public.members mem ON mem.user_id = pm.user_id
        WHERE pm.project_id = p_project_id
          AND pm.user_id = (SELECT auth.uid())
      ),
      false
    )
  );
$$;

-- Update member_can_read_project
-- Note: We allow expired users to READ their data? 
-- The user said "Locked" implies they can still see it but not edit.
-- However, "Locked" in many apps means hidden too.
-- For now, let's keep READ access open so they can see what they're missing,
-- but block WRITE access.
CREATE OR REPLACE FUNCTION public.member_can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = p_project_id
        AND pm.user_id = (SELECT auth.uid())
    );
$$;

-- Update member_is_admin (Simplification)
CREATE OR REPLACE FUNCTION public.member_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_member_active() AND public.is_app_admin();
$$;

NOTIFY pgrst, 'reload schema';
