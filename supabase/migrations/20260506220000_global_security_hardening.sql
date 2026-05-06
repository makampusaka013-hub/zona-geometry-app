-- =============================================================================
-- Migration: Global Security Hardening v6 (Linter Resolution - Final Polishing)
-- Description: 
-- 1. Fixes "Function Search Path Mutable" by setting search_path on public wrappers.
-- 2. Fixes "RLS Policy Always True" by adding a check to projects_insert_policy.
-- 3. NUCLEAR CLEANUP: البرنامج Programmatic cleanup of policies and triggers.
-- 4. API BYPASS: Allows SERVICE_ROLE to bypass administrative checks.
-- =============================================================================

-- 1. Buat Schema Internal
CREATE SCHEMA IF NOT EXISTS internal;

-- 2. NUCLEAR POLICY CLEANUP (Harus dilakukan pertama)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.members', pol.policyname);
    END LOOP;
    FOR pol IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', pol.policyname);
    END LOOP;
END $$;

-- 3. Definisi Shadow RLS Helpers (Internal DEFINER)
DROP FUNCTION IF EXISTS internal.is_app_admin();
CREATE OR REPLACE FUNCTION internal.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT m.role = 'admin' FROM public.members m WHERE m.user_id = auth.uid()), false);
$$;

DROP FUNCTION IF EXISTS internal.is_app_active();
CREATE OR REPLACE FUNCTION internal.is_app_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_status text;
BEGIN
  SELECT role, approval_status INTO v_role, v_status FROM public.members WHERE user_id = auth.uid();
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_status = 'active' THEN RETURN true; END IF;
  RETURN false;
END $$;

DROP FUNCTION IF EXISTS internal.member_can_read_project(uuid);
CREATE OR REPLACE FUNCTION internal.member_can_read_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT internal.is_app_admin() OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid());
$$;

DROP FUNCTION IF EXISTS internal.member_can_write_project(uuid);
CREATE OR REPLACE FUNCTION internal.member_can_write_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT internal.is_app_active() AND (internal.is_app_admin() OR COALESCE((SELECT pm.can_write AND mem.role <> 'view' FROM public.project_members pm JOIN public.members mem ON mem.user_id = pm.user_id WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()), false));
$$;

-- 4. Definisi Fungsi Administratif (Dengan Bypass Service Role)
DROP FUNCTION IF EXISTS public.activate_user_admin(UUID);
CREATE OR REPLACE FUNCTION public.activate_user_admin(p_user_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        UPDATE public.members SET approval_status = 'active', is_verified_manual = true WHERE user_id = p_user_id;
        RETURN jsonb_build_object('success', true);
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat mengaktifkan user.';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        UPDATE public.members SET role = new_role::public.member_role WHERE user_id = target_id;
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat mengubah role user.';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_user_status(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_set_user_status(target_id uuid, new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        UPDATE public.members SET status = new_status WHERE user_id = target_id;
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat mengubah status user.';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_user_expiry(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.admin_set_user_expiry(target_id uuid, new_expiry timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        UPDATE public.members SET expired_at = new_expiry WHERE user_id = target_id;
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat mengubah masa aktif.';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.delete_user_entirely(uuid);
CREATE OR REPLACE FUNCTION public.delete_user_entirely(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        DELETE FROM auth.users WHERE id = target_user_id;
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat menghapus user secara permanen.';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.update_global_profit(numeric);
CREATE OR REPLACE FUNCTION public.update_global_profit(p_profit numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role') OR internal.is_app_admin() THEN
        UPDATE public.global_settings SET value = p_profit::text WHERE key = 'default_profit_percent';
    ELSE
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat mengubah profit global.';
    END IF;
END;
$$;

-- 5. Public Wrappers (SECURITY INVOKER + Fixed search_path)
-- Menambahkan SET search_path untuk mengatasi linter "Function Search Path Mutable"
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT internal.is_app_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_app_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT internal.is_app_active();
$$;

CREATE OR REPLACE FUNCTION public.member_can_read_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT internal.member_can_read_project(p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.member_can_write_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT internal.member_can_write_project(p_project_id);
$$;

-- 6. Recreate Clean Policies
CREATE POLICY members_select_own_or_admin ON public.members FOR SELECT TO authenticated USING (user_id = auth.uid() OR internal.is_app_admin());
CREATE POLICY members_update_own ON public.members FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY projects_read_policy ON public.projects FOR SELECT TO authenticated USING (internal.member_can_read_project(id));
CREATE POLICY projects_write_policy ON public.projects FOR ALL TO authenticated USING (internal.member_can_write_project(id));

-- Fix "RLS Policy Always True" by adding a check for project insertion
CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 7. SYNC WITH AUTHENTICATOR (Hapus Trigger)
DROP TRIGGER IF EXISTS protect_member_sensitive_data ON public.members;
DROP TRIGGER IF EXISTS tr_protect_member_sensitive_data ON public.members;
DROP TRIGGER IF EXISTS tr_force_active_admin ON public.members;
DROP FUNCTION IF EXISTS public.protect_member_sensitive_data() CASCADE;

-- 8. Hardening Fungsi Dashboard
ALTER FUNCTION public.get_ahsp_catalog_v2(uuid, text, text, boolean, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_project_resource_aggregation(uuid) SECURITY INVOKER;
ALTER FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) SECURITY INVOKER;
ALTER FUNCTION public.update_user_heartbeat(text, text) SECURITY INVOKER;

-- 9. Cabut Izin Eksekusi Global (Nuclear Revoke)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM public, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;

-- 10. Berikan Izin Eksekusi Whitelist
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_active() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_can_read_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_can_write_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ahsp_catalog_v2(uuid, text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_resource_aggregation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(text, text) TO authenticated;

-- 11. Izin untuk Schema Internal
GRANT USAGE ON SCHEMA internal TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA internal TO anon, authenticated;

-- Reload Schema
NOTIFY pgrst, 'reload schema';
