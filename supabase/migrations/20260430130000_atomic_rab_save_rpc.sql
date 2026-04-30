-- =============================================================================
-- Migration: Atomic Project & RAB Save RPC
-- Handles Project identity and RAB lines in a single transaction
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_project_atomic(
    p_project_id UUID,
    p_identity JSONB,
    p_lines JSONB[],
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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 1. Handle Project Identity
    IF p_project_id IS NOT NULL THEN
        -- Optimistic Concurrency Check
        SELECT version INTO v_current_version FROM projects WHERE id = p_project_id;
        
        IF v_current_version IS NULL THEN
            RAISE EXCEPTION 'Project not found';
        END IF;

        -- Version mismatch check
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
            location_id = (p_identity->>'location_id')::UUID,
            fiscal_year = COALESCE(p_identity->>'fiscal_year', fiscal_year),
            contract_number = COALESCE(p_identity->>'contract_number', contract_number),
            hsp_value = (p_identity->>'hsp_value')::NUMERIC,
            ppn_percent = (p_identity->>'ppn_percent')::NUMERIC,
            overhead_percent = (p_identity->>'overhead_percent')::NUMERIC,
            start_date = (p_identity->>'start_date')::DATE,
            updated_at = NOW(),
            updated_by = v_user_id,
            client_id = p_client_id,
            version = v_current_version + 1
        WHERE id = p_project_id
        RETURNING id INTO v_new_project_id;
    ELSE
        INSERT INTO projects (
            name, program_name, activity_name, work_name, location, location_id, 
            fiscal_year, contract_number, hsp_value, ppn_percent, overhead_percent, 
            start_date, created_by, updated_by, client_id, version
        )
        VALUES (
            p_identity->>'name', p_identity->>'program_name', p_identity->>'activity_name', 
            p_identity->>'work_name', p_identity->>'location', (p_identity->>'location_id')::UUID, 
            p_identity->>'fiscal_year', p_identity->>'contract_number', (p_identity->>'hsp_value')::NUMERIC, 
            (p_identity->>'ppn_percent')::NUMERIC, (p_identity->>'overhead_percent')::NUMERIC, 
            (p_identity->>'start_date')::DATE, v_user_id, v_user_id, p_client_id, 1
        )
        RETURNING id INTO v_new_project_id;
    END IF;

    -- 2. Handle RAB Lines
    FOREACH v_line IN ARRAY p_lines LOOP
        IF (v_line->>'id') IS NOT NULL THEN
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
            RETURNING id INTO v_line; -- Temp use v_line to get ID
            v_kept_line_ids := array_append(v_kept_line_ids, (v_line->>'id')::UUID);
        END IF;
    END LOOP;

    -- 3. Delete missing lines (if requested)
    IF p_delete_missing THEN
        -- SOFT DELETE
        UPDATE ahsp_lines 
        SET deleted_at = NOW(), updated_by = v_user_id
        WHERE project_id = v_new_project_id 
        AND id != ALL(v_kept_line_ids)
        AND deleted_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'project_id', v_new_project_id,
        'status', 'success'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';
