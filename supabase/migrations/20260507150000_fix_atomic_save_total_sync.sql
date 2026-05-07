
-- =============================================================================
-- Migration: Robust Atomic Save with Total Recalculation
-- Description: Menjamin total_kontrak selalu terupdate setelah simpan RAB.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_project_atomic(
    p_project_id UUID,
    p_identity JSONB,
    p_lines JSONB,
    p_delete_missing BOOLEAN DEFAULT TRUE,
    p_client_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_project_id UUID;
    v_current_version INTEGER;
    v_line JSONB;
    v_kept_line_ids UUID[] := ARRAY[]::UUID[];
    v_calc_subtotal NUMERIC := 0;
    v_ppn_percent NUMERIC;
    v_final_total NUMERIC;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 1. Handle Project Identity
    IF p_project_id IS NOT NULL THEN
        -- Ambil versi dan PPN saat ini
        SELECT version, ppn_percent INTO v_current_version, v_ppn_percent FROM projects WHERE id = p_project_id;
        
        IF v_current_version IS NULL THEN
            RAISE EXCEPTION 'Project not found';
        END IF;

        IF (p_identity->>'version')::INTEGER < v_current_version THEN
            RAISE EXCEPTION 'Konflik: Data telah diupdate oleh user lain.';
        END IF;

        UPDATE projects 
        SET 
            name = COALESCE(p_identity->>'name', name),
            program_name = COALESCE(p_identity->>'program_name', program_name),
            activity_name = COALESCE(p_identity->>'activity_name', activity_name),
            work_name = COALESCE(p_identity->>'work_name', work_name),
            location = COALESCE(p_identity->>'location', location),
            location_id = COALESCE((p_identity->>'location_id')::UUID, location_id),
            fiscal_year = COALESCE(p_identity->>'fiscal_year', fiscal_year),
            contract_number = COALESCE(p_identity->>'contract_number', contract_number),
            hsp_value = COALESCE((p_identity->>'hsp_value')::NUMERIC, hsp_value),
            ppn_percent = COALESCE((p_identity->>'ppn_percent')::NUMERIC, ppn_percent),
            overhead_percent = COALESCE((p_identity->>'overhead_percent')::NUMERIC, overhead_percent),
            start_date = COALESCE((p_identity->>'start_date')::DATE, start_date),
            
            ppk_name = COALESCE(p_identity->>'ppk_name', ppk_name),
            ppk_nip = COALESCE(p_identity->>'ppk_nip', ppk_nip),
            pptk_name = COALESCE(p_identity->>'pptk_name', pptk_name),
            pptk_nip = COALESCE(p_identity->>'pptk_nip', pptk_nip),
            kadis_name = COALESCE(p_identity->>'kadis_name', kadis_name),
            kadis_nip = COALESCE(p_identity->>'kadis_nip', kadis_nip),
            kabid_name = COALESCE(p_identity->>'kabid_name', kabid_name),
            kabid_nip = COALESCE(p_identity->>'kabid_nip', kabid_nip),
            konsultan_name = COALESCE(p_identity->>'konsultan_name', konsultan_name),
            konsultan_supervisor = COALESCE(p_identity->>'konsultan_supervisor', konsultan_supervisor),
            konsultan_title = COALESCE(p_identity->>'konsultan_title', konsultan_title),
            kontraktor_director = COALESCE(p_identity->>'kontraktor_director', kontraktor_director),
            kontraktor_title = COALESCE(p_identity->>'kontraktor_title', kontraktor_title),
            kontraktor_name = COALESCE(p_identity->>'kontraktor_name', kontraktor_name),
            
            manual_duration = COALESCE((p_identity->>'manual_duration')::INTEGER, manual_duration),
            planned_duration = COALESCE((p_identity->>'planned_duration')::INTEGER, planned_duration),
            labor_settings = COALESCE(p_identity->'labor_settings', labor_settings),
            
            updated_at = NOW(),
            updated_by = v_user_id,
            client_id = p_client_id,
            version = v_current_version + 1
        WHERE id = p_project_id
        RETURNING id, ppn_percent INTO v_new_project_id, v_ppn_percent;
    ELSE
        INSERT INTO projects (
            name, program_name, activity_name, work_name, location, location_id, 
            fiscal_year, contract_number, hsp_value, ppn_percent, overhead_percent, 
            start_date, ppk_name, ppk_nip, pptk_name, pptk_nip, kadis_name, kadis_nip, 
            kabid_name, kabid_nip, konsultan_name, konsultan_supervisor, 
            konsultan_title, kontraktor_director, kontraktor_title,
            kontraktor_name, manual_duration, planned_duration, labor_settings,
            created_by, updated_by, client_id, version
        )
        VALUES (
            p_identity->>'name', p_identity->>'program_name', p_identity->>'activity_name', 
            p_identity->>'work_name', p_identity->>'location', (p_identity->>'location_id')::UUID, 
            p_identity->>'fiscal_year', p_identity->>'contract_number', (p_identity->>'hsp_value')::NUMERIC, 
            COALESCE((p_identity->>'ppn_percent')::NUMERIC, 12), (p_identity->>'overhead_percent')::NUMERIC, 
            (p_identity->>'start_date')::DATE,
            p_identity->>'ppk_name', p_identity->>'ppk_nip', p_identity->>'pptk_name', p_identity->>'pptk_nip',
            p_identity->>'kadis_name', p_identity->>'kadis_nip', p_identity->>'kabid_name', p_identity->>'kabid_nip',
            p_identity->>'konsultan_name', p_identity->>'konsultan_supervisor', 
            p_identity->>'konsultan_title', p_identity->>'kontraktor_director', p_identity->>'kontraktor_title',
            p_identity->>'kontraktor_name', (p_identity->>'manual_duration')::INTEGER, 
            COALESCE((p_identity->>'planned_duration')::INTEGER, 0),
            COALESCE(p_identity->'labor_settings', '{}'::JSONB),
            v_user_id, v_user_id, p_client_id, 1
        )
        RETURNING id, ppn_percent INTO v_new_project_id, v_ppn_percent;
    END IF;

    -- 2. Handle RAB Lines
    IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
            IF (v_line->>'id') IS NOT NULL AND (v_line->>'id') != '' THEN
                UPDATE ahsp_lines SET
                    master_ahsp_id = (v_line->>'master_ahsp_id')::UUID,
                    bab_pekerjaan = v_line->>'bab_pekerjaan',
                    sort_order = (v_line->>'sort_order')::INTEGER,
                    uraian = v_line->>'uraian',
                    uraian_custom = v_line->>'uraian_custom',
                    satuan = v_line->>'satuan',
                    volume = (v_line->>'volume')::NUMERIC,
                    harga_satuan = (v_line->>'harga_satuan')::NUMERIC,
                    jumlah = (v_line->>'jumlah')::NUMERIC,
                    profit_percent = (v_line->>'profit_percent')::NUMERIC,
                    analisa_custom = (v_line->'analisa_custom'),
                    pekerja_input = (v_line->>'pekerja_input')::INTEGER,
                    durasi_input = (v_line->>'durasi_input')::INTEGER,
                    start_date = (v_line->>'start_date')::DATE,
                    updated_at = NOW(),
                    updated_by = v_user_id,
                    client_id = p_client_id,
                    version = COALESCE((v_line->>'version')::INTEGER, 1) + 1
                WHERE id = (v_line->>'id')::UUID;
                v_kept_line_ids := array_append(v_kept_line_ids, (v_line->>'id')::UUID);
            ELSE
                INSERT INTO ahsp_lines (
                    project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, 
                    uraian_custom, satuan, volume, harga_satuan, jumlah, profit_percent, 
                    analisa_custom, pekerja_input, durasi_input, start_date, updated_by, client_id, version
                )
                VALUES (
                    v_new_project_id, (v_line->>'master_ahsp_id')::UUID, v_line->>'bab_pekerjaan', 
                    (v_line->>'sort_order')::INTEGER, v_line->>'uraian', v_line->>'uraian_custom', 
                    v_line->>'satuan', (v_line->>'volume')::NUMERIC, (v_line->>'harga_satuan')::NUMERIC, 
                    (v_line->>'jumlah')::NUMERIC, (v_line->>'profit_percent')::NUMERIC, 
                    (v_line->'analisa_custom'), (v_line->>'pekerja_input')::INTEGER, 
                    (v_line->>'durasi_input')::INTEGER, (v_line->>'start_date')::DATE, v_user_id, p_client_id, 1
                )
                RETURNING id INTO v_line;
                v_kept_line_ids := array_append(v_kept_line_ids, (v_line->>'id')::UUID);
            END IF;
        END LOOP;
    END IF;

    -- 3. Delete missing lines
    IF p_delete_missing THEN
        UPDATE ahsp_lines SET deleted_at = NOW(), updated_by = v_user_id
        WHERE project_id = v_new_project_id AND id != ALL(v_kept_line_ids) AND deleted_at IS NULL;
    END IF;

    -- 4. RECALCULATE TOTAL_KONTRAK (CRITICAL FIX)
    SELECT SUM(jumlah) INTO v_calc_subtotal FROM ahsp_lines WHERE project_id = v_new_project_id AND deleted_at IS NULL;
    v_final_total := CEIL(COALESCE(v_calc_subtotal, 0) * (1 + v_ppn_percent / 100) / 1000) * 1000;
    
    UPDATE projects SET total_kontrak = v_final_total WHERE id = v_new_project_id;

    RETURN jsonb_build_object(
        'project_id', v_new_project_id,
        'status', 'success',
        'total_kontrak', v_final_total,
        'version', COALESCE(v_current_version, 0) + 1
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;
