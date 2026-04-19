-- =============================================================================
-- SECURITY HARDENING: SET SEARCH_PATH FOR PUBLIC FUNCTIONS
-- Resolves "role mutable search_path" vulnerability
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_func_names TEXT[] := ARRAY[
        'calculate_backup_total', 
        'calculate_cco_jumlah', 
        'clear_user_session', 
        'delete_user_entirely', 
        'force_active_for_admin'
    ];
    v_target_name TEXT;
    v_schema_name TEXT := 'public';
BEGIN
    FOREACH v_target_name IN ARRAY v_func_names
    LOOP
        -- Find all functions matching the name in the public schema
        -- This covers different parameter signatures (e.g. triggers vs RPCs)
        FOR r IN (
            SELECT 
                n.nspname as schema_name,
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = v_schema_name AND p.proname = v_target_name
        )
        LOOP
            -- Execute ALTER FUNCTION for each specific identity
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %L', 
                r.schema_name, r.function_name, r.args, v_schema_name);
                
            RAISE NOTICE 'Hardened search_path for %.%(%)', r.schema_name, r.function_name, r.args;
        END LOOP;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Double Check: Explicit Security Definer check for sensitive operations
-- -----------------------------------------------------------------------------
-- delete_user_entirely should always be SECURITY DEFINER
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'delete_user_entirely'
    ) THEN
        -- We don't overwrite the whole function, just ensure the property is set if it wasn't
        -- (Set manually just in case the dynamic logic missed the context)
        ALTER FUNCTION public.delete_user_entirely(uuid) SECURITY DEFINER;
    END IF;
END $$;

-- Reload schema for PostgREST
NOTIFY pgrst, 'reload schema';
