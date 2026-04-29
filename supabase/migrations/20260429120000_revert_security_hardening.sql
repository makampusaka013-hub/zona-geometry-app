-- Migration: REVERT Security Hardening (Robust Emergency Fix)
-- Description: Restores EXECUTE permissions to security helper functions to fix login issues.

DO $$ 
DECLARE
    func_record RECORD;
    -- List of functions to restore access to
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
        -- Find all variations of the function in the public schema
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
            EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO PUBLIC, authenticated, anon', 
                func_record.schema, func_record.name, func_record.args);
        END LOOP;
    END LOOP;
END $$;

-- Drop the problematic "Bypass" policies if they exist (keep them dropped for security)
-- But if the user wants FULL revert, we could recreate them, but it's better to keep them off.
-- For now, let's just focus on restoring function access which was the cause of the lockout.

NOTIFY pgrst, 'reload schema';

