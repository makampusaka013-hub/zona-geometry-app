-- ============================================================
-- FIX: Missing column 'analisa_custom' and outdated RPC
-- ============================================================

-- 1. ADD COLUMN 'analisa_custom' if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='ahsp_lines' AND column_name='analisa_custom') THEN
        ALTER TABLE public.ahsp_lines ADD COLUMN analisa_custom JSONB DEFAULT '[]'::JSONB;
    END IF;
END $$;

-- 2. UPDATE RPC save_project_transactional to handle the new column
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
  v_new_line_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
     v_user_id := (p_project_data->>'user_id')::UUID;
  END IF;

  -- 2.1 Project Quota Limit
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

  -- 2.2 Insert/Update Project Header
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
    
    -- 2.3 SMART DELETE: Hanya hapus baris yang TIDAK ada dalam list p_lines terbaru
    DELETE FROM public.ahsp_lines 
    WHERE project_id = v_project_id 
      AND id NOT IN (
        SELECT (val->>'id')::UUID 
        FROM jsonb_array_elements(p_lines) AS val 
        WHERE val->>'id' IS NOT NULL
      );
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

  -- 2.4 Sync Lines and snapshots
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
      -- UPSERT ahsp_lines: Preserve ID if exists to maintain FK integrity (Progress/CCO/MC)
      INSERT INTO public.ahsp_lines (
        id, project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, uraian_custom, satuan, volume, harga_satuan, jumlah, analisa_custom
      ) VALUES (
        COALESCE(r.id, gen_random_uuid()), v_project_id, r.master_ahsp_id, r.bab_pekerjaan, r.sort_order, r.uraian, r.uraian_custom, r.satuan, r.volume, r.harga_satuan, r.jumlah, r.analisa_custom
      ) 
      ON CONFLICT (id) DO UPDATE SET
        master_ahsp_id = EXCLUDED.master_ahsp_id,
        bab_pekerjaan = EXCLUDED.bab_pekerjaan,
        sort_order = EXCLUDED.sort_order,
        uraian = EXCLUDED.uraian,
        uraian_custom = EXCLUDED.uraian_custom,
        satuan = EXCLUDED.satuan,
        volume = EXCLUDED.volume,
        harga_satuan = EXCLUDED.harga_satuan,
        jumlah = EXCLUDED.jumlah,
        analisa_custom = EXCLUDED.analisa_custom,
        updated_at = NOW()
      RETURNING id INTO v_new_line_id;

      -- Only generate snapshots if they don't already exist for this line
      IF r.master_ahsp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ahsp_line_snapshots WHERE ahsp_line_id = v_new_line_id) THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
