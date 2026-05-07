
-- =============================================================================
-- Migration: Emergency Trigger Inspector
-- Description: Creates a temporary RPC to find the hidden trigger that keeps 
--              resetting the hsp_value.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.debug_get_triggers()
RETURNS TABLE(t_name TEXT, t_table TEXT, t_event TEXT, t_timing TEXT, t_function TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tgname::TEXT, 
        relname::TEXT, 
        tgtype::TEXT, 
        CASE WHEN (tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END,
        proname::TEXT
    FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
    WHERE relname IN ('projects', 'ahsp_lines')
    AND tgisinternal = false;
END;
$$;
