-- ============================================================
-- FIX: reset_project_slot permission
-- ============================================================

-- Izinkan pemegang peran (user itu sendiri) untuk mereset slot mereka sendiri
-- selain owner/admin.

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
  -- Ambil ID pemilik
  SELECT created_by INTO v_creator FROM public.projects WHERE id = p_project_id;

  -- Cek izin: Owner, Admin, atau pemegang peran tersebut
  IF v_creator IS DISTINCT FROM v_caller 
     AND NOT public.is_app_admin() 
     AND NOT EXISTS (
       SELECT 1 FROM public.project_members 
       WHERE project_id = p_project_id 
         AND slot_role = p_slot_role 
         AND user_id = v_caller
     )
  THEN
    RETURN jsonb_build_object('error', 'Anda tidak memiliki izin untuk mereset slot ini.');
  END IF;

  -- Update member's role to NULL
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
