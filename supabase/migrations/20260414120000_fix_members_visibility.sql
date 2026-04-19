-- ============================================================
-- FIX MEMBERS VISIBILITY FOR PROJECT OWNERS
-- ============================================================

-- 1. Mediator Function to check if user A and user B share a project
--    Specifically: Can user A (auth.uid()) see user B (p_target_user_id)?
--    Allowed if user A is the owner of any project where user B is a member.
CREATE OR REPLACE FUNCTION public.can_see_member_profile(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.user_id = p_target_user_id 
      AND (p.created_by = auth.uid() OR public.is_app_admin())
  );
$$;

-- 2. Update RLS Policy for public.members
-- We allow viewing a profile if it's your own, if you're an admin, 
-- or if you're the owner of a project that the target user has joined.
DROP POLICY IF EXISTS members_select_own_or_admin ON public.members;
CREATE POLICY members_select_own_or_admin
  ON public.members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.is_app_admin()
    OR public.can_see_member_profile(user_id)
  );

-- 3. Final Schema Reload
NOTIFY pgrst, 'reload schema';
