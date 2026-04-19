-- =============================================================================
-- SECURITY HARDENING: RPC SEARCH PATH FIX
-- Resolves "Mutable search_path" warnings from Supabase for all RPC functions
-- =============================================================================

-- 1. Mass Hardening for all mentioned functions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'is_app_admin', 'generate_project_code', 'member_can_read_project', 
            'member_can_write_project', 'member_is_workspace_pro_or_admin', 
            'get_my_project_slot', 'count_my_projects', 'join_project_by_code', 
            'reset_project_slot', 'get_project_slots', 'remove_project_member', 
            'set_line_final', 'get_all_users_admin', 'patch_users_expired_rpc',
            'save_custom_ahsp', 'save_project_transactional', 'projects_set_unique_code',
            'projects_after_insert_add_creator', 'workspaces_after_insert_add_creator',
            'members_enforce_public_signup_role'
          )
    )
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
            r.schema_name, r.function_name, r.args);
    END LOOP;
END $$;

-- 7. Reload Schema
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
