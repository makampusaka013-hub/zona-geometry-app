-- Refactoring: Add versioning and updated_by for conflict handling and RBAC

-- 1. Update projects table
alter table public.projects 
add column if not exists version integer not null default 1,
add column if not exists updated_by uuid references public.members (user_id);

-- 2. Update ahsp_lines table
alter table public.ahsp_lines
add column if not exists version integer not null default 1,
add column if not exists updated_by uuid references public.members (user_id);

-- 3. Update existing triggers to NOT auto-increment version (we'll do it manually for optimistic concurrency)
-- But we can add a trigger to update updated_at and updated_by automatically if not provided.

-- 4. Update RLS for projects
-- Ensure updated_by is set to the current user on update
create or replace function public.projects_set_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;

-- Note: We might NOT want to auto-increment version in the trigger if we want to enforce optimistic locking from the app.
-- If we do it in the trigger, then any update succeeds but increments version.
-- Optimistic locking usually means: UPDATE ... SET version = version + 1 WHERE version = current_version_in_app.
-- If we use the trigger, we can still do that.

-- Actually, let's just add the columns for now and handle the logic in the service layer as requested.
-- The user said: if (incoming.version < current.version) ignore.

-- 5. Security Hardening (Addressing Linter Warnings)
-- Fix for projects_set_audit_fields (Search Path) is handled in definition above.

-- Fix for is_project_member (Revoke public access to Security Definer functions)
-- This ensures only the database internal system or authorized roles can call it if needed, 
-- or forces it to use RLS if changed to SECURITY INVOKER.
revoke execute on function public.is_project_member(uuid) from anon;
revoke execute on function public.is_project_member(uuid) from authenticated;

-- 5. Add versioning to other critical tables if needed
-- For now, projects and ahsp_lines are the priority.

-- 6. RBAC Enforcement Enhancements
-- (Optional: Add specific roles logic if not fully covered by current functions)

NOTIFY pgrst, 'reload schema';
