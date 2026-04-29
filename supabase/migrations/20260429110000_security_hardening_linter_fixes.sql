-- Migration: Security Hardening & Linter Fixes (Robust Version)
-- Description: Removes permissive "Bypass" RLS policies and hardens SECURITY DEFINER helper functions.

-- 1. Remove permissive RLS policies identified by linter
DROP POLICY IF EXISTS "Bypass RLS ahsp_lines" ON public.ahsp_lines;
DROP POLICY IF EXISTS "Bypass RLS update projects" ON public.projects;

-- 2. Harden helper functions by revoking EXECUTE from public/authenticated roles.
-- We use a DO block to safely handle cases where functions might not exist or have different signatures.
DO $$ 
DECLARE
    func_record RECORD;
    -- List of sensitive functions to hide from API
    target_functions TEXT[] := ARRAY[
        'is_project_member',
        'is_project_owner',
        'member_can_read_project',
        'member_can_write_project',
        'can_view_profile',
        'is_member_active',
        'is_app_admin',
        'member_is_admin'
    ];
    target_func TEXT;
BEGIN
    FOREACH target_func IN ARRAY target_functions
    LOOP
        -- Find all variations of the function (any number of arguments)
        FOR func_record IN (
            SELECT 
                n.nspname as schema,
                p.proname as name,
                pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' 
              AND p.proname = target_func
        )
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, authenticated, anon', 
                func_record.schema, func_record.name, func_record.args);
        END LOOP;
    END LOOP;
END $$;

-- 3. Ensure RLS is enabled for critical tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ahsp_lines ENABLE ROW LEVEL SECURITY;

-- 4. Reload PostgREST to reflect changes in API schema
NOTIFY pgrst, 'reload schema';

