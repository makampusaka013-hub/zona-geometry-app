
-- =============================================================================
-- Migration: Global Security Hardening
-- Description: Fixes search_path vulnerability for public functions and triggers.
--              Addressing Supabase Linter Warning: function_search_path_mutable
-- =============================================================================

-- 1. Fix save_project_atomic
ALTER FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) SET search_path = public;

-- 2. Fix other common public functions
ALTER FUNCTION public.is_app_admin() SET search_path = public;
ALTER FUNCTION public.log_entity_changes() SET search_path = public;

-- 3. If there are triggers, ensure their functions are also hardened
ALTER FUNCTION public.handle_new_user_sync() SET search_path = public;

-- 4. Re-verify save_project_atomic specifically
-- This ensures the LATEST definition (from 20260504004000) is also covered 
-- if it was somehow applied without the search_path attribute.
DO $$ 
BEGIN
    EXECUTE 'ALTER FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) SET search_path = public';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not alter save_project_atomic: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
