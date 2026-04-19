-- ============================================================
-- FINAL STABILIZATION: RESOLVE RLS CIRCULARITY
-- ============================================================

-- 1. CLEANUP: Remove potentially conflicting older policies
DROP POLICY IF EXISTS "Projects select for owners and members" ON public.projects;
DROP POLICY IF EXISTS "Project members select for owners and self" ON public.project_members;
DROP POLICY IF EXISTS members_select_own_or_admin ON public.members;

-- 2. MEDIATOR FUNCTIONS (Bypass RLS to break recursion)
-- These are SECURITY DEFINER to avoid triggering RLS checks within policies.

CREATE OR REPLACE FUNCTION public.is_project_owner(p_proj_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = p_proj_id AND created_by = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(p_proj_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_proj_id AND user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_target_id uuid, p_viewer_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  -- Viewer can see target if they share ANY project where viewer is owner
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.user_id = p_target_id AND p.created_by = p_viewer_id
  );
$$;

-- 3. APPLY NEW LINEAR POLICIES

-- PROJECTS: Owner sees own, Member sees if joined, Admin sees all
CREATE POLICY "projects_select_v3" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = auth.uid() 
  OR public.is_project_member(id, auth.uid())
  OR public.is_app_admin()
);

-- PROJECT_MEMBERS: Self sees own, Owner sees all members, Admin sees all
CREATE POLICY "project_members_select_v3" ON public.project_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_project_owner(project_id, auth.uid())
  OR public.is_app_admin()
);

-- MEMBERS: Self sees own, Project Owner sees members profile, Admin sees all
CREATE POLICY "members_select_v3" ON public.members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_view_profile(user_id, auth.uid())
  OR public.is_app_admin()
);

-- 4. RELOAD
NOTIFY pgrst, 'reload schema';
