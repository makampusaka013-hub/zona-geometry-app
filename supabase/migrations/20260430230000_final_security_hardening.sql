-- =============================================================================
-- Migration: Final Security Hardening (Advisor Center Cleanup)
-- Description: Mencabut izin eksekusi publik untuk fungsi SECURITY DEFINER
--              dan mengunci search_path untuk mematuhi standar keamanan Supabase.
-- =============================================================================

-- 1. Cabut izin eksekusi dari PUBLIC (semua orang)
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_online_status(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_heartbeat(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Berikan kembali izin hanya pada role yang benar-benar membutuhkan (via API)
-- Catatan: RLS tetap bisa memanggil fungsi ini meskipun izin EXECUTE dicabut dari PUBLIC.
-- Namun, jika aplikasi Anda memanggilnya via supabase.rpc(), berikan izin spesifik:

GRANT EXECUTE ON FUNCTION public.update_user_heartbeat(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_online_status(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;

-- 3. Kunci search_path (Tambahan Keamanan)
ALTER FUNCTION public.is_app_admin() SET search_path = public;
ALTER FUNCTION public.is_project_member(uuid) SET search_path = public;
ALTER FUNCTION public.check_user_online_status(text) SET search_path = public;
ALTER FUNCTION public.update_user_heartbeat(text, text) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
