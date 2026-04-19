-- ============================================================
-- MIGRATION: Update Collaboration Slots (3 Slots)
-- - Allow slots: 'pembuat_1', 'pembuat_2', 'pengecek'
-- - 'pembuat_1' and 'pembuat_2' get can_write = true
-- - 'pengecek' gets can_write = false
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_project_slot(
  p_project_id uuid,
  p_user_id    uuid,
  p_slot_role  text 
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_is_owner boolean;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role FROM public.members WHERE user_id = v_caller_id;
  
  -- Check if owner
  SELECT (created_by = v_caller_id) INTO v_is_owner FROM public.projects WHERE id = p_project_id;

  IF NOT (v_is_owner OR v_caller_role = 'admin') THEN
    RETURN jsonb_build_object('error', 'Hanya pemilik proyek atau admin yang dapat menetapkan peran.');
  END IF;

  -- Validate slot role
  IF p_slot_role NOT IN ('pembuat_1', 'pembuat_2', 'pengecek') THEN
    RETURN jsonb_build_object('error', 'Peran tidak valid. Gunakan: pembuat_1, pembuat_2, atau pengecek.');
  END IF;

  -- Check if slot is already occupied by someone else
  IF EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_id = p_project_id 
      AND slot_role = p_slot_role 
      AND user_id != p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Peran ' || p_slot_role || ' sudah terisi oleh personel lain.');
  END IF;

  -- Update member's role
  UPDATE public.project_members
  SET slot_role = p_slot_role,
      can_write = CASE WHEN p_slot_role IN ('pembuat_1', 'pembuat_2') THEN true ELSE false END,
      assigned_at = now()
  WHERE project_id = p_project_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User tidak ditemukan dalam keanggotaan proyek ini.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_project_slot(uuid, uuid, text) TO authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
