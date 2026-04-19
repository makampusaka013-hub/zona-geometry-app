-- ============================================================
-- FIX: reset_project_slot behavior
-- ============================================================

-- Ubah perilaku reset_project_slot agar hanya menghapus role (NULL)
-- dan tidak menghapus member dari proyek sepenuhnya.

CREATE OR REPLACE FUNCTION public.reset_project_slot(
  p_project_id uuid,
  p_slot_role  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_caller  uuid := auth.uid();
BEGIN
  -- Only creator or admin can reset
  SELECT created_by INTO v_creator FROM public.projects WHERE id = p_project_id;

  IF v_creator IS DISTINCT FROM v_caller AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya pembuat proyek atau admin yang dapat mereset slot.');
  END IF;

  -- Update member's role to NULL instead of deleting the row
  UPDATE public.project_members
  SET slot_role = NULL,
      can_write = false,
      assigned_at = now()
  WHERE project_id = p_project_id AND slot_role = p_slot_role;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_project_slot(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
