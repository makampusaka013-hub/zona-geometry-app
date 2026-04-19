-- ============================================================
-- RPC: remove_project_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_project_member(
  p_project_id uuid,
  p_user_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_owner boolean;
BEGIN
  -- Check if caller is owner or admin
  SELECT (created_by = v_caller_id) INTO v_is_owner FROM public.projects WHERE id = p_project_id;
  
  IF NOT (v_is_owner OR public.is_app_admin()) THEN
    RETURN jsonb_build_object('error', 'Hanya pemilik proyek atau admin yang dapat mengeluarkan anggota.');
  END IF;

  -- Block removing the owner themselves
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND created_by = p_user_id) THEN
    RETURN jsonb_build_object('error', 'Pemilik proyek tidak dapat dikeluarkan dari keanggotaan.');
  END IF;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_project_member(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
