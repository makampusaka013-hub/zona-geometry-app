-- ============================================================
-- FIX PROJECT MEMBERS RLS & OWNER MEMBERSHIP
-- ============================================================

-- 1. Ensure Owner is a Member on Create
-- We update save_project_transactional to automatically add the creator to project_members
CREATE OR REPLACE FUNCTION public.save_project_transactional(
  p_project_id UUID,
  p_project_data JSONB,
  p_lines JSONB
)
RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- NEW: Automatically add creator to project_members
    INSERT INTO public.project_members (project_id, user_id, can_write, assigned_at)
    VALUES (v_project_id, v_user_id, true, now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- [Rest of the function remains the same...]
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

-- 2. Backfill existing owners into project_members
INSERT INTO public.project_members (project_id, user_id, can_write, assigned_at)
SELECT id, created_by, true, now()
FROM public.projects
ON CONFLICT DO NOTHING;

-- 3. RLS for project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members select for owners and self" ON public.project_members;
CREATE POLICY "Project members select for owners and self" ON public.project_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() -- Can see self
  OR 
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_members.project_id 
    AND (created_by = auth.uid() OR public.is_app_admin())
  ) -- Owner/Admin can see everyone in the project
);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
