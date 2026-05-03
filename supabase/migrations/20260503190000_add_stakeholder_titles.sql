-- 1. TAMBAH KOLOM JABATAN
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS konsultan_title TEXT,
ADD COLUMN IF NOT EXISTS kontraktor_title TEXT;

-- 2. UPDATE RPC SAVE_PROJECT_ATOMIC (VERSI SUPER LENGKAP + JABATAN)
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
BEGIN
    -- 1. HANDLE IDENTITY
    IF p_project_id IS NOT NULL THEN
        SELECT version INTO v_current_version FROM projects WHERE id = p_project_id;
        
        UPDATE projects SET 
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
            manual_duration = (p_identity->>'manual_duration')::INTEGER,
            
            -- STAKEHOLDERS (PPK/PPTK)
            ppk_name = COALESCE(p_identity->>'ppk_name', ppk_name),
            ppk_nip = COALESCE(p_identity->>'ppk_nip', ppk_nip),
            pptk_name = COALESCE(p_identity->>'pptk_name', pptk_name),
            pptk_nip = COALESCE(p_identity->>'pptk_nip', pptk_nip),
            
            -- DINAS (KADIS/KABID)
            kadis_name = COALESCE(p_identity->>'kadis_name', kadis_name),
            kadis_nip = COALESCE(p_identity->>'kadis_nip', kadis_nip),
            kabid_name = COALESCE(p_identity->>'kabid_name', kabid_name),
            kabid_nip = COALESCE(p_identity->>'kabid_nip', kabid_nip),
            
            -- KONSULTAN
            konsultan_name = COALESCE(p_identity->>'konsultan_name', konsultan_name),
            konsultan_supervisor = COALESCE(p_identity->>'konsultan_supervisor', konsultan_supervisor),
            konsultan_title = COALESCE(p_identity->>'konsultan_title', konsultan_title), -- NEW
            
            -- KONTRAKTOR
            kontraktor_name = COALESCE(p_identity->>'kontraktor_name', kontraktor_name),
            kontraktor_director = COALESCE(p_identity->>'kontraktor_director', kontraktor_director),
            kontraktor_title = COALESCE(p_identity->>'kontraktor_title', kontraktor_title), -- NEW
            
            updated_at = NOW(),
            updated_by = v_user_id,
            version = v_current_version + 1
        WHERE id = p_project_id
        RETURNING id INTO v_new_project_id;
    END IF;

    RETURN jsonb_build_object('project_id', v_new_project_id, 'status', 'success', 'version', v_current_version + 1);
END;
$$;
