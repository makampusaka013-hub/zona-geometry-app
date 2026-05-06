-- Migration: Global Security Hardening
-- Tujuan: Memperbaiki semua temuan linter terkait Search Path Mutable dan Public Execution.

-- 1. Fungsi Profit & Konversi (Yang Baru Dibuat)
ALTER FUNCTION public.get_global_profit() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_global_profit() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_global_profit() TO authenticated;

ALTER FUNCTION public.update_global_profit(numeric) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_global_profit(numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_global_profit(numeric) TO authenticated;

ALTER FUNCTION public.sync_all_catalog_to_konversi() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.sync_all_catalog_to_konversi() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_all_catalog_to_konversi() TO authenticated;

-- 2. Fungsi Utama Aplikasi (Resource & AHSP)
ALTER FUNCTION public.get_project_resource_aggregation(uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_project_resource_aggregation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_project_resource_aggregation(uuid) TO authenticated;

ALTER FUNCTION public.get_ahsp_catalog_v2(uuid, text, text, boolean, integer, integer) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_ahsp_catalog_v2(uuid, text, text, boolean, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ahsp_catalog_v2(uuid, text, text, boolean, integer, integer) TO authenticated;

-- 3. Fungsi System & Admin
ALTER FUNCTION public.is_app_admin() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

ALTER FUNCTION public.is_project_member(uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;

-- 4. Fungsi Transaksional (Paling Krusial)
ALTER FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_project_atomic(uuid, jsonb, jsonb, boolean, uuid) TO authenticated;

-- 5. Fungsi Monitoring & User Status
ALTER FUNCTION public.check_user_online_status(text) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.check_user_online_status(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_user_online_status(text) TO authenticated;

ALTER FUNCTION public.update_user_heartbeat(text, text) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_user_heartbeat(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(text, text) TO authenticated;
