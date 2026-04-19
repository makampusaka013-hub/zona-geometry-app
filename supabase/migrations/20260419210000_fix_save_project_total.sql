-- =============================================================================
-- Migration: Fix save_project_transactional (Robust ID Handling)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_project_transactional(
  p_project_id UUID,
  p_project_data JSONB,
  p_lines JSONB
)
RETURNS UUID AS $$
DECLARE
  v_calc_subtotal NUMERIC := 0;
  v_ppn_percent NUMERIC;
  v_final_total NUMERIC;
  v_new_id UUID;
  r RECORD;
  v_existing_ids UUID[] := ARRAY[]::UUID[];
  v_line_item JSONB;
BEGIN
  -- SETUP SESSION CONTEXT
  PERFORM set_config('app.cur_user_id', COALESCE(auth.uid(), (p_project_data->>'user_id')::UUID)::TEXT, true);
  
  -- Handle Location Context
  PERFORM set_config('app.cur_loc_id', COALESCE(
    (p_project_data->>'location_id')::TEXT,
    (SELECT location_id::TEXT FROM public.projects WHERE id = p_project_id),
    (SELECT selected_location_id::TEXT FROM public.members WHERE user_id = auth.uid())
  ), true);

  v_ppn_percent := COALESCE((p_project_data->>'ppn_percent')::NUMERIC, 12);

  -- 1. Calculate Aggregates
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line_item IN SELECT jsonb_array_elements(p_lines) LOOP
       v_calc_subtotal := v_calc_subtotal + COALESCE((v_line_item->>'jumlah')::NUMERIC, 0);
       IF v_line_item->>'id' IS NOT NULL THEN
         v_existing_ids := array_append(v_existing_ids, (v_line_item->>'id')::UUID);
       END IF;
    END LOOP;
  END IF;

  v_final_total := CEIL(COALESCE(v_calc_subtotal, 0) * (1 + v_ppn_percent / 100) / 1000) * 1000;

  -- 2. Project Header Update/Insert
  IF p_project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    PERFORM set_config('app.cur_proj_id', p_project_id::TEXT, true);
    
    UPDATE public.projects SET
      name = p_project_data->>'name',
      code = p_project_data->>'code',
      program_name = p_project_data->>'program_name',
      activity_name = p_project_data->>'activity_name',
      work_name = p_project_data->>'work_name',
      location = p_project_data->>'location',
      location_id = NULLIF(current_setting('app.cur_loc_id', true), '')::UUID, 
      fiscal_year = p_project_data->>'fiscal_year',
      contract_number = p_project_data->>'contract_number',
      hsp_value = (p_project_data->>'hsp_value')::NUMERIC,
      ppn_percent = v_ppn_percent,
      total_kontrak = v_final_total, 
      updated_at = NOW()
    WHERE id = (current_setting('app.cur_proj_id', true))::UUID;
  ELSE
    INSERT INTO public.projects (
      user_id, created_by, name, code, program_name, activity_name, 
      work_name, location, location_id, fiscal_year, contract_number, hsp_value, ppn_percent, total_kontrak
    ) VALUES (
      (current_setting('app.cur_user_id', true))::UUID, 
      (current_setting('app.cur_user_id', true))::UUID, 
      p_project_data->>'name', p_project_data->>'code', p_project_data->>'program_name', 
      p_project_data->>'activity_name', p_project_data->>'work_name', p_project_data->>'location', 
      NULLIF(current_setting('app.cur_loc_id', true), '')::UUID, 
      p_project_data->>'fiscal_year', p_project_data->>'contract_number', (p_project_data->>'hsp_value')::NUMERIC,
      v_ppn_percent, v_final_total
    )
    RETURNING id INTO v_new_id;
    PERFORM set_config('app.cur_proj_id', v_new_id::TEXT, true);
  END IF;

  -- 3. Smart Sync Lines
  DELETE FROM public.ahsp_lines 
  WHERE project_id = (current_setting('app.cur_proj_id', true))::UUID
  AND (id != ALL(v_existing_ids));

  -- 4. Upsert Lines
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
        PERFORM set_config('app.cur_line_id', r.id::TEXT, true);
      ELSE
        INSERT INTO public.ahsp_lines (
          project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, uraian_custom, satuan, volume, harga_satuan, jumlah, analisa_custom
        ) VALUES (
          (current_setting('app.cur_proj_id', true))::UUID, 
          r.master_ahsp_id, r.bab_pekerjaan, r.sort_order, r.uraian, r.uraian_custom, r.satuan, r.volume, r.harga_satuan, r.jumlah, r.analisa_custom
        ) RETURNING id INTO v_new_id;
        PERFORM set_config('app.cur_line_id', v_new_id::TEXT, true);
      END IF;

      -- 5. Snapshots (Using r.master_ahsp_id which is NOT overwritten now)
      DELETE FROM public.ahsp_line_snapshots WHERE ahsp_line_id = (current_setting('app.cur_line_id', true))::UUID;

      IF r.master_ahsp_id IS NOT NULL THEN
        INSERT INTO public.ahsp_line_snapshots (
          ahsp_line_id, uraian, kode_item, satuan, koefisien, harga_konversi, jenis_komponen, subtotal, tkdn
        )
        SELECT 
           (current_setting('app.cur_line_id', true))::UUID, 
           mad.uraian_ahsp, 
           COALESCE(mhd.kode_item, mad.uraian_ahsp),
           mad.satuan_uraian,
           mad.koefisien,
           (mhd.harga_satuan / COALESCE(NULLIF(mk.faktor_konversi, 0), 1)),
           CASE 
             WHEN upper(substring(trim(COALESCE(mhd.kode_item, '')), 1, 1)) = 'L' THEN 'tenaga'
             WHEN upper(substring(trim(COALESCE(mhd.kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
             WHEN upper(substring(trim(COALESCE(mhd.kode_item, '')), 1, 1)) = 'M' THEN 'alat'
             ELSE 'lainnya'
           END,
           (mhd.harga_satuan / COALESCE(NULLIF(mk.faktor_konversi, 0), 1)) * mad.koefisien,
           mhd.tkdn_percent
        FROM public.master_ahsp_details mad
        LEFT JOIN public.master_konversi mk 
               ON mk.uraian_ahsp = mad.uraian_ahsp 
              AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)
        LEFT JOIN public.master_harga_dasar mhd 
               ON mhd.id = mk.item_dasar_id 
              AND mhd.location_id = NULLIF(current_setting('app.cur_loc_id', true), '')::UUID
        WHERE mad.ahsp_id = r.master_ahsp_id;
      END IF;
    END LOOP;
  END IF;

  RETURN (current_setting('app.cur_proj_id', true))::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
