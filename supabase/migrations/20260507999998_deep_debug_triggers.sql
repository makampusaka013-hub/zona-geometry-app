
-- =============================================================================
-- Migration: Deep Trigger Inspector
-- Description: Mencari source code trigger yang mengandung 'hsp_value'
-- =============================================================================

CREATE OR REPLACE FUNCTION public.debug_inspect_triggers()
RETURNS TABLE(trigger_name TEXT, table_name TEXT, function_source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        trg.tgname::TEXT,
        rel.relname::TEXT,
        proc.prosrc::TEXT
    FROM pg_trigger trg
    JOIN pg_class rel ON trg.tgrelid = rel.oid
    JOIN pg_proc proc ON trg.tgfoid = proc.oid
    WHERE proc.prosrc ILIKE '%hsp_value%'
    OR proc.prosrc ILIKE '%10773540%';
END;
$$;
