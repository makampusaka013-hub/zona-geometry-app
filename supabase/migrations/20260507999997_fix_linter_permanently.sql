
-- =============================================================================
-- PERMANENT LINTER FIX: SWITCH TO SECURITY INVOKER & UPDATE RLS
-- =============================================================================

-- 1. Perbarui Kebijakan (Policy) Tabel Projects agar Member bisa update Header
-- Sebelumnya hanya Owner/Admin yang bisa, ini alasan kenapa kita butuh Security Definer.
-- Sekarang kita izinkan Member dengan hak akses 'can_write' untuk update juga.

DROP POLICY IF EXISTS projects_update_owner_or_admin ON public.projects;

CREATE POLICY projects_update_authorized_users
ON public.projects FOR UPDATE
TO authenticated
USING (
  public.is_app_admin() 
  OR user_id = auth.uid()
  OR public.member_can_write_project(id)
)
WITH CHECK (
  public.is_app_admin() 
  OR user_id = auth.uid()
  OR public.member_can_write_project(id)
);

-- 2. Ubah fungsi save_project_atomic menjadi SECURITY INVOKER
-- Ini akan menghilangkan peringatan Linter selamanya.
ALTER FUNCTION public.save_project_atomic(UUID, JSONB, JSONB, BOOLEAN, UUID) SECURITY INVOKER;

-- 3. Pastikan izin eksekusi tetap hanya untuk user login
REVOKE EXECUTE ON FUNCTION public.save_project_atomic(UUID, JSONB, JSONB, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_project_atomic(UUID, JSONB, JSONB, BOOLEAN, UUID) TO authenticated;

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
