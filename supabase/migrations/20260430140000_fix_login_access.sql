-- =============================================================================
-- Migration: Fix Login Access & Permissions
-- Description: Restores smooth login flow by ensuring all required functions 
--              are accessible and removing blocking online checks.
-- =============================================================================

-- 1. Ensure check_user_online_status is accessible to everyone (including non-logged in users)
-- This is needed because the login page calls this before the session is established.
GRANT EXECUTE ON FUNCTION public.check_user_online_status(TEXT) TO anon, authenticated;

-- 2. Ensure update_user_heartbeat is accessible to authenticated users
GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(TEXT, TEXT) TO authenticated;

-- 3. Simplify update_user_heartbeat to ensure it NEVER blocks, only DISPLACES.
CREATE OR REPLACE FUNCTION public.update_user_heartbeat(
    p_session_id TEXT,
    p_client_type TEXT DEFAULT 'web'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Displacement logic: Delete OTHER sessions of the same type for this user
    -- This ensures that the NEW login always wins.
    DELETE FROM public.active_sessions
    WHERE user_id = auth.uid()
      AND client_type = p_client_type
      AND session_id <> p_session_id;

    -- Upsert current session
    INSERT INTO public.active_sessions (user_id, session_id, client_type, last_active_at)
    VALUES (auth.uid(), p_session_id, p_client_type, NOW())
    ON CONFLICT (session_id) DO UPDATE
    SET last_active_at = EXCLUDED.last_active_at,
        client_type = EXCLUDED.client_type;
        
    -- Periodic cleanup of dead sessions (older than 30 minutes for safety)
    DELETE FROM public.active_sessions WHERE last_active_at < (NOW() - INTERVAL '30 minutes');

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    -- Never fail the login process just because heartbeat failed
    RETURN FALSE;
END;
$$;

-- 4. Ensure is_app_active is robust and doesn't block login
-- It should only be used for RLS, not for blocking the initial auth.
GRANT EXECUTE ON FUNCTION public.is_app_active() TO authenticated;

-- 5. Reload PostgREST
NOTIFY pgrst, 'reload schema';
