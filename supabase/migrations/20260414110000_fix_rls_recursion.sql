-- ============================================================
-- EMERGENCY FIX: RESOLVE RLS RECURSION & RESTORE DATA VISIBILITY
-- ============================================================

-- 1. Mediator Function (Security Definer) to bypass RLS recursion
-- This function checks if a user is the owner of a project without triggering RLS on the projects table.
CREATE OR REPLACE FUNCTION public.check_is_project_owner(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = p_project_id AND created_by = p_user_id
  );
$$;

-- 2. Mediator Function (Security Definer) to check membership
-- Bypasses RLS on project_members
CREATE OR REPLACE FUNCTION public.check_is_project_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$;

-- 3. Update RLS Policy for public.projects
-- We use the mediator function for membership check to avoid circular RLS evaluation.
DROP POLICY IF EXISTS "Projects select for owners and members" ON public.projects;
CREATE POLICY "Projects select for owners and members" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = auth.uid() -- Fast check (Owner)
  OR 
  public.check_is_project_member(id, auth.uid()) -- Mediator check (Member)
);

-- 4. Update RLS Policy for public.project_members
-- We use the mediator function for ownership check to avoid circular RLS evaluation.
DROP POLICY IF EXISTS "Project members select for owners and self" ON public.project_members;
CREATE POLICY "Project members select for owners and self" ON public.project_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() -- Fast check (Self)
  OR 
  public.check_is_project_owner(project_id, auth.uid()) -- Mediator check (Owner)
  OR
  public.is_app_admin() -- Admin check
);

-- 5. Final Schema Reload
NOTIFY pgrst, 'reload schema';
