-- Menambahkan PPN ke projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ppn_percent NUMERIC NOT NULL DEFAULT 12;

-- Mengubah procedure save_project_transactional agar memproses ppn_percent
CREATE OR REPLACE FUNCTION public.save_project_transactional(
  p_project_id UUID,
  p_project_data JSONB,
  p_lines JSONB
)
RETURNS UUID AS $$
DECLARE
  v_project_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
     v_user_id := (p_project_data->>'user_id')::UUID;
  END IF;

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
    
    DELETE FROM public.ahsp_lines
    WHERE project_id = v_project_id;
  ELSE
    INSERT INTO public.projects (
      user_id, created_by, name, code, program_name, activity_name, 
      work_name, location, fiscal_year, contract_number, hsp_value, ppn_percent
    ) VALUES (
      v_user_id,
      v_user_id,
      p_project_data->>'name',
      p_project_data->>'code',
      p_project_data->>'program_name',
      p_project_data->>'activity_name',
      p_project_data->>'work_name',
      p_project_data->>'location',
      p_project_data->>'fiscal_year',
      p_project_data->>'contract_number',
      (p_project_data->>'hsp_value')::NUMERIC,
      COALESCE((p_project_data->>'ppn_percent')::NUMERIC, 12)
    )
    RETURNING id INTO v_project_id;
  END IF;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    INSERT INTO public.ahsp_lines (
      project_id,
      bab_pekerjaan,
      sort_order,
      uraian,
      uraian_custom,
      satuan,
      volume,
      harga_satuan,
      jumlah
    )
    SELECT
      v_project_id,
      x.bab_pekerjaan,
      x.sort_order,
      x.uraian,
      x.uraian_custom,
      x.satuan,
      x.volume,
      x.harga_satuan,
      x.jumlah
    FROM jsonb_to_recordset(p_lines) AS x(
      bab_pekerjaan TEXT,
      sort_order INTEGER,
      uraian TEXT,
      uraian_custom TEXT,
      satuan TEXT,
      volume NUMERIC,
      harga_satuan NUMERIC,
      jumlah NUMERIC
    );
  END IF;

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
