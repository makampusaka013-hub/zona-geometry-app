-- ============================================================
-- COLLABORATION V2: REFINED JOIN + OWNER ASSIGNMENT
-- ============================================================

-- 1. Redefine join_project_by_code (Remove p_slot)
--    Enforces limits: 3 Owned, 7 Joined (Non-Admins)
CREATE OR REPLACE FUNCTION public.join_project_by_code(
  p_code    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_user_id    uuid := auth.uid();
  v_user_role  text;
  v_joined_count integer;
BEGIN
  -- Get caller's role
  SELECT role INTO v_user_role FROM public.members WHERE user_id = v_user_id;

  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object('error', 'Profil member tidak ditemukan.');
  END IF;

  -- Check approval status
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE user_id = v_user_id AND approval_status = 'active') THEN
    RETURN jsonb_build_object('error', 'Akun Anda belum diaktifkan oleh Admin.');
  END IF;

  -- Find project by code
  SELECT id INTO v_project_id FROM public.projects WHERE upper(trim(unique_code)) = upper(trim(p_code));
  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Kode proyek tidak ditemukan. Periksa kembali kode yang Anda masukkan.');
  END IF;

  -- Check: Is owner?
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id AND created_by = v_user_id) THEN
    RETURN jsonb_build_object('error', 'Anda adalah pemilik proyek ini.');
  END IF;

  -- Check: Already a member?
  IF EXISTS (SELECT 1 FROM public.project_members WHERE project_id = v_project_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('error', 'Anda sudah terdaftar dalam proyek ini.');
  END IF;

  -- Check: Joined Project limit reached (max 7 for non-admin)
  IF v_user_role != 'admin' THEN
    SELECT COUNT(*)::integer INTO v_joined_count 
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.user_id = v_user_id 
      AND p.created_by != v_user_id; -- Projects where user is NOT the owner

    IF v_joined_count >= 7 THEN
      RETURN jsonb_build_object('error', 'Batas maksimal bergabung (7 proyek) telah tercapai. Keluar dari proyek lain untuk bergabung.');
    END IF;
  END IF;

  -- Insert into project_members with NULL role (Waiting for Owner assignment)
  INSERT INTO public.project_members (project_id, user_id, slot_role, can_write, assigned_at)
  VALUES (v_project_id, v_user_id, NULL, false, now());

  RETURN jsonb_build_object('success', true, 'project_id', v_project_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_project_by_code(text) TO authenticated;

-- 2. RPC: assign_project_slot (Owner Management)
--    Only project creator or admin can assign a role to a member
CREATE OR REPLACE FUNCTION public.assign_project_slot(
  p_project_id uuid,
  p_user_id    uuid,
  p_slot_role  text -- 'kontraktor', 'konsultan', 'instansi'
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
  IF p_slot_role NOT IN ('kontraktor', 'konsultan', 'instansi') THEN
    RETURN jsonb_build_object('error', 'Peran tidak valid. Gunakan: kontraktor, konsultan, atau instansi.');
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
      can_write = CASE WHEN p_slot_role IN ('kontraktor', 'instansi') THEN true ELSE false END,
      assigned_at = now()
  WHERE project_id = p_project_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User tidak ditemukan dalam keanggotaan proyek ini.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_project_slot(uuid, uuid, text) TO authenticated;

-- 3. RPC: leave_project
--    Allows a member to leave a project (cannot be the owner)
CREATE OR REPLACE FUNCTION public.leave_project(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Check if owner
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND created_by = v_user_id) THEN
    RETURN jsonb_build_object('error', 'Pemilik proyek tidak dapat keluar. Anda harus menghapus proyek jika ingin melenyapkannya.');
  END IF;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.leave_project(uuid) TO authenticated;

-- Update RLS for projects table to ensure created_by logic is solid
DROP POLICY IF EXISTS "Projects select for owners and members" ON public.projects;
CREATE POLICY "Projects select for owners and members" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = auth.uid() OR 
  id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';

-- 4. RPC: save_project_transactional (Improved: Protected Ownership)
--    Ensures user_id and created_by are never changed during updates
CREATE OR REPLACE FUNCTION public.save_project_transactional(
  p_project_id UUID,
  p_project_data JSONB,
  p_lines JSONB
)
RETURNS UUID 
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id UUID;
  v_user_id UUID;
  r RECORD;
  v_new_line_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
     v_user_id := (p_project_data->>'user_id')::UUID;
  END IF;

  -- 4.1 Project Quota Limit (Max 3 for Pro)
  IF p_project_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.members 
      WHERE user_id = v_user_id AND role = 'pro'
    ) THEN
      IF (SELECT count(*) FROM public.projects WHERE user_id = v_user_id) >= 3 THEN
        RAISE EXCEPTION 'Batas 3 proyek untuk akun PRO telah tercapai. Hapus salah satu proyek lama untuk membuat yang baru.';
      END IF;
    END IF;
  END IF;

  -- 4.2 Insert/Update Project Header
  IF p_project_id IS NOT NULL THEN
    -- PROTECT OWNERSHIP: We do NOT update user_id or created_by
    UPDATE public.projects
    SET
      name = p_project_data->>'name',
      code = p_project_data->>'code',
      program_name = p_project_data->>'program_name',
      activity_name = p_project_data->>'activity_name',
      work_name = p_project_data->>'work_name',
      location = p_project_data->>'location',
      fiscal_year = p_project_data->>'fiscal_year',
      contract_number = p_project_data->>'contract_number',
      hsp_value = (p_project_data->>'hsp_value')::NUMERIC,
      ppn_percent = COALESCE((p_project_data->>'ppn_percent')::NUMERIC, 12),
      updated_at = NOW()
    WHERE id = p_project_id;
    
    v_project_id := p_project_id;
    DELETE FROM public.ahsp_lines WHERE project_id = v_project_id;
  ELSE
    -- For NEW projects, set both to the creator
    INSERT INTO public.projects (
      user_id, created_by, name, code, program_name, activity_name, 
      work_name, location, fiscal_year, contract_number, hsp_value, ppn_percent
    ) VALUES (
      v_user_id, v_user_id, p_project_data->>'name', p_project_data->>'code', p_project_data->>'program_name', 
      p_project_data->>'activity_name', p_project_data->>'work_name', p_project_data->>'location', 
      p_project_data->>'fiscal_year', p_project_data->>'contract_number', (p_project_data->>'hsp_value')::NUMERIC,
      COALESCE((p_project_data->>'ppn_percent')::NUMERIC, 12)
    )
    RETURNING id INTO v_project_id;
  END IF;

  -- 4.3 Insert Lines and AHSP Snapshots
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
      bab_pekerjaan TEXT,
      sort_order INTEGER,
      uraian TEXT,
      uraian_custom TEXT,
      satuan TEXT,
      volume NUMERIC,
      harga_satuan NUMERIC,
      jumlah NUMERIC,
      master_ahsp_id UUID
    )
    LOOP
      INSERT INTO public.ahsp_lines (
        project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, uraian_custom, satuan, volume, harga_satuan, jumlah
      ) VALUES (
        v_project_id, r.master_ahsp_id, r.bab_pekerjaan, r.sort_order, r.uraian, r.uraian_custom, r.satuan, r.volume, r.harga_satuan, r.jumlah
      ) RETURNING id INTO v_new_line_id;

      IF r.master_ahsp_id IS NOT NULL THEN
        INSERT INTO public.ahsp_line_snapshots (
          ahsp_line_id, uraian, kode_item, satuan, koefisien, harga_konversi, jenis_komponen, subtotal, tkdn
        )
        SELECT 
          v_new_line_id, detail.uraian, detail.kode_item, detail.satuan, detail.koefisien, 
          detail.harga_konversi, detail.jenis_komponen, detail.subtotal, detail.tkdn
        FROM (
          SELECT jsonb_array_elements(details) as d
          FROM public.view_katalog_ahsp_lengkap
          WHERE master_ahsp_id = r.master_ahsp_id
        ) sub,
        LATERAL jsonb_to_record(sub.d) as detail(
          uraian text, kode_item text, satuan text, koefisien numeric, harga_konversi numeric, jenis_komponen text, subtotal numeric, tkdn numeric
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_project_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_project_transactional(uuid, jsonb, jsonb) TO authenticated;

-- Final reload
NOTIFY pgrst, 'reload schema';

