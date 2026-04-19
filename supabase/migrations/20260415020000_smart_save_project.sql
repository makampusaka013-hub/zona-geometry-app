-- ============================================================
-- REPAIR: save_project_transactional to support SMART UPSERT
-- This prevents deleting existing lines (and their backups)
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_project_transactional(
  p_project_id UUID,
  p_project_data JSONB,
  p_lines JSONB
)
RETURNS UUID AS $$
DECLARE
  v_project_id UUID;
  v_user_id UUID;
  r RECORD;
  v_target_line_id UUID;
  v_existing_ids UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
     v_user_id := (p_project_data->>'user_id')::UUID;
  END IF;

  -- 1. Project Header Update/Insert
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
  END IF;

  -- 2. Smart Sync Lines
  -- Collect IDs that are still in the payload
  SELECT array_agg((val->>'id')::UUID) INTO v_existing_ids
  FROM jsonb_array_elements(p_lines) AS val
  WHERE val->>'id' IS NOT NULL;

  -- Delete lines that are no longer in the payload for this project
  DELETE FROM public.ahsp_lines 
  WHERE project_id = v_project_id 
  AND (id != ALL(COALESCE(v_existing_ids, ARRAY[]::UUID[])));

  -- 3. Upsert Lines and snapshots
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
      id UUID,
      bab_pekerjaan TEXT,
      sort_order INTEGER,
      uraian TEXT,
      uraian_custom TEXT,
      satuan TEXT,
      volume NUMERIC,
      harga_satuan NUMERIC,
      jumlah NUMERIC,
      master_ahsp_id UUID,
      analisa_custom JSONB
    )
    LOOP
      IF r.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ahsp_lines WHERE id = r.id) THEN
        -- UPDATE existing line
        UPDATE public.ahsp_lines SET
          bab_pekerjaan = r.bab_pekerjaan,
          sort_order = r.sort_order,
          uraian = r.uraian,
          uraian_custom = r.uraian_custom,
          satuan = r.satuan,
          volume = r.volume,
          harga_satuan = r.harga_satuan,
          jumlah = r.jumlah,
          master_ahsp_id = r.master_ahsp_id,
          analisa_custom = r.analisa_custom,
          updated_at = NOW()
        WHERE id = r.id;
        v_target_line_id := r.id;
        
        -- Refresh snapshots for the updated line
        DELETE FROM public.ahsp_line_snapshots WHERE ahsp_line_id = v_target_line_id;
      ELSE
        -- INSERT new line
        INSERT INTO public.ahsp_lines (
          project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, uraian_custom, satuan, volume, harga_satuan, jumlah, analisa_custom
        ) VALUES (
          v_project_id, r.master_ahsp_id, r.bab_pekerjaan, r.sort_order, r.uraian, r.uraian_custom, r.satuan, r.volume, r.harga_satuan, r.jumlah, r.analisa_custom
        ) RETURNING id INTO v_target_line_id;
      END IF;

      -- Re-insert snapshots if it's an AHSP item
      IF r.master_ahsp_id IS NOT NULL THEN
        INSERT INTO public.ahsp_line_snapshots (
          ahsp_line_id, uraian, kode_item, satuan, koefisien, harga_konversi, jenis_komponen, subtotal, tkdn
        )
        SELECT 
          v_target_line_id, detail.uraian, detail.kode_item, detail.satuan, detail.koefisien, 
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
