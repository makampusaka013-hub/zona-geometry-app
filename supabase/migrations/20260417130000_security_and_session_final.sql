-- =============================================================================
-- SECURITY & SESSION HARDENING: FINAL CONCURRENCY CONTROL
-- Targets: Secure Master Data & 1-Web/1-Mobile Session Policy
-- =============================================================================

-- 1. FIX OVERLY PERMISSIVE MASTER DATA POLICIES
-- -----------------------------------------------------------------------------

-- [manpower_analysis]
DROP POLICY IF EXISTS "manpower_analysis_access_vFinal" ON public.manpower_analysis;
CREATE POLICY "manpower_analysis_select_vFinal" ON public.manpower_analysis
    FOR SELECT TO authenticated USING ( true );
CREATE POLICY "manpower_analysis_manage_admin_vFinal" ON public.manpower_analysis
    FOR ALL TO authenticated USING ( public.is_app_admin() ) WITH CHECK ( public.is_app_admin() );

-- [master_harga_dasar]
DROP POLICY IF EXISTS "master_harga_dasar_access_vFinal" ON public.master_harga_dasar;
CREATE POLICY "master_harga_dasar_select_vFinal" ON public.master_harga_dasar
    FOR SELECT TO authenticated USING ( true );
CREATE POLICY "master_harga_dasar_manage_admin_vFinal" ON public.master_harga_dasar
    FOR ALL TO authenticated USING ( public.is_app_admin() ) WITH CHECK ( public.is_app_admin() );


-- 2. ENFORCE SESSION CONCURRENCY (1 Web + 1 Mobile)
-- -----------------------------------------------------------------------------

-- Ensure table exists with correct columns
CREATE TABLE IF NOT EXISTS public.active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.members (user_id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    client_type TEXT CHECK (client_type IN ('web', 'mobile')) NOT NULL DEFAULT 'web',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure client_type column exists if table already existed
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.active_sessions'::regclass AND attname = 'client_type') THEN
        ALTER TABLE public.active_sessions ADD COLUMN client_type TEXT CHECK (client_type IN ('web', 'mobile')) NOT NULL DEFAULT 'web';
    END IF;
END $$;

-- 2.1 RPC: update_user_heartbeat
-- Updates current session heartbeat and KICKS OUT older sessions of the SAME type.
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
    -- 1. Kick out other sessions of the SAME type for this user (Displacement logic)
    DELETE FROM public.active_sessions
    WHERE user_id = auth.uid()
      AND client_type = p_client_type
      AND session_id <> p_session_id;

    -- 2. Upsert current session
    INSERT INTO public.active_sessions (user_id, session_id, client_type, last_active_at)
    VALUES (auth.uid(), p_session_id, p_client_type, NOW())
    ON CONFLICT (session_id) DO UPDATE
    SET last_active_at = EXCLUDED.last_active_at,
        client_type = EXCLUDED.client_type;
        
    -- 3. Cleanup stale sessions (older than 5 minutes)
    DELETE FROM public.active_sessions WHERE last_active_at < (NOW() - INTERVAL '5 minutes');

    RETURN TRUE;
END;
$$;

-- 2.2 RPC: check_user_online_status
-- Replaces old binary check with a more granular one.
CREATE OR REPLACE FUNCTION public.check_user_online_status(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_full_name TEXT;
    v_web_online BOOLEAN;
    v_mobile_online BOOLEAN;
BEGIN
    -- Find user
    SELECT m.user_id, m.full_name INTO v_user_id, v_full_name
    FROM public.members m
    JOIN auth.users au ON au.id = m.user_id
    WHERE au.email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('online', false);
    END IF;

    -- Check Web sessions
    SELECT EXISTS (
        SELECT 1 FROM public.active_sessions
        WHERE user_id = v_user_id AND client_type = 'web'
          AND last_active_at > (NOW() - INTERVAL '2 minutes')
    ) INTO v_web_online;

    -- Check Mobile sessions
    SELECT EXISTS (
        SELECT 1 FROM public.active_sessions
        WHERE user_id = v_user_id AND client_type = 'mobile'
          AND last_active_at > (NOW() - INTERVAL '2 minutes')
    ) INTO v_mobile_online;

    RETURN jsonb_build_object(
        'online', (v_web_online OR v_mobile_online), -- For legacy compatibility
        'web_active', v_web_online,
        'mobile_active', v_mobile_online,
        'name', v_full_name
    );
END;
$$;

-- 3. Permissions & Reload
GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_online_status(TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
