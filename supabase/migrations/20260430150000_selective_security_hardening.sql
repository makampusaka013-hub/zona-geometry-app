-- =============================================================================
-- Migration: Selective Security Hardening (Linter Fixes)
-- Description: Fixes search_path and restricts RPC access for internal functions.
-- =============================================================================

-- 1. Fix search_path for log_entity_changes (Audit Trigger)
-- Also revoke direct execution from API since it should only be a trigger.
CREATE OR REPLACE FUNCTION public.log_entity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before)
        VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
            INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before)
            VALUES (auth.uid(), 'SOFT_DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        ELSE
            INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before, data_after)
            VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), to_jsonb(NEW));
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_after)
        VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Secure execution for triggers
REVOKE EXECUTE ON FUNCTION public.log_entity_changes() FROM PUBLIC, anon, authenticated;

-- 2. Fix is_project_member (Security Definer restriction)
-- This function is used in RLS policies. It shouldn't be callable directly via RPC.
CREATE OR REPLACE FUNCTION public.is_project_member(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_id AND user_id = auth.uid()
  );
$$;

-- Revoke API access, keep it for DB internal (RLS)
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Fix check_user_online_status (search_path)
-- Keep this callable for login flow but secure the search_path.
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
    SELECT m.user_id, m.full_name INTO v_user_id, v_full_name
    FROM public.members m
    JOIN auth.users au ON au.id = m.user_id
    WHERE au.email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('online', false);
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.active_sessions
        WHERE user_id = v_user_id AND client_type = 'web'
          AND last_active_at > (NOW() - INTERVAL '2 minutes')
    ) INTO v_web_online;

    SELECT EXISTS (
        SELECT 1 FROM public.active_sessions
        WHERE user_id = v_user_id AND client_type = 'mobile'
          AND last_active_at > (NOW() - INTERVAL '2 minutes')
    ) INTO v_mobile_online;

    RETURN jsonb_build_object(
        'online', (v_web_online OR v_mobile_online),
        'web_active', v_web_online,
        'mobile_active', v_mobile_online,
        'name', v_full_name
    );
END;
$$;

-- 4. Re-verify update_user_heartbeat search_path (Security Definer check)
ALTER FUNCTION public.update_user_heartbeat(TEXT, TEXT) SET search_path = public;

-- 5. Final Permission Check:
-- Ensure only essential functions for login/heartbeat are exposed via API.
GRANT EXECUTE ON FUNCTION public.check_user_online_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(TEXT, TEXT) TO authenticated;

-- Reload PostgREST
NOTIFY pgrst, 'reload schema';
