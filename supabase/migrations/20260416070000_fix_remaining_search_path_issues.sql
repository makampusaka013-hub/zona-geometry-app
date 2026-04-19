-- =============================================================================
-- SECURITY HARDENING: FINAL SEARCH_PATH ENFORCEMENT
-- Resolves "role mutable search_path" for specific functions and all public RPCs/Triggers
-- =============================================================================

-- 1. Explicit Hardening for functions mentioned by User
-- -----------------------------------------------------------------------------

-- Note: We use a DO block to safely handle various parameter signatures 
-- and ensure we don't fail if a function is missing or has multiple overloads.

DO $$
DECLARE
    r RECORD;
    v_func_names TEXT[] := ARRAY[
        'handle_new_user',
        'is_user_online',
        'join_project_by_code',
        'save_custom_ahsp',
        'set_updated_at_uapo'
    ];
    v_target_name TEXT;
BEGIN
    FOREACH v_target_name IN ARRAY v_func_names
    LOOP
        FOR r IN (
            SELECT 
                n.nspname as schema_name,
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = v_target_name
        )
        LOOP
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                r.schema_name, r.function_name, r.args);
            RAISE NOTICE 'Explicitly hardened search_path for %.%(%)', r.schema_name, r.function_name, r.args;
        END LOOP;
    END LOOP;
END $$;

-- 2. Dynamic Mass Hardening for ALL functions in PUBLIC schema
--    This ensures NO public function is left with a mutable search_path.
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
          -- Only target functions that don't already have search_path set in proconfig
          AND (p.proconfig IS NULL OR NOT (p.proconfig @> ARRAY['search_path=public']))
          -- Avoid changing internal pseudo-types or special functions if any
          AND p.prokind = 'f' 
    )
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                r.schema_name, r.function_name, r.args);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Could not set search_path for %.%(%): %', r.schema_name, r.function_name, r.args, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3. Reload Schema
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
