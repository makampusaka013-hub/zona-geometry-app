-- 1. Trigger for Automatic Member Profile Creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.members (user_id, full_name, role, status)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'view'),
    'active'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid conflicts if previously created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Transactional RPC for saving project
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
  -- Extract user_id from auth if needed, or from project_data
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
     v_user_id := (p_project_data->>'user_id')::UUID;
  END IF;

  IF p_project_id IS NOT NULL THEN
    -- Update existing project
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
      updated_at = NOW()
    WHERE id = p_project_id;
    
    v_project_id := p_project_id;
    
    -- Delete old lines
    DELETE FROM public.ahsp_lines
    WHERE project_id = v_project_id;
  ELSE
    -- Insert new project
    INSERT INTO public.projects (
      user_id, created_by, name, code, program_name, activity_name, 
      work_name, location, fiscal_year, contract_number, hsp_value
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
      (p_project_data->>'hsp_value')::NUMERIC
    )
    RETURNING id INTO v_project_id;
  END IF;

  -- Insert new lines
  -- We parse the jsonb array in a subquery to insert
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


-- 3. RPC for complete user deletion (Admin Only)
CREATE OR REPLACE FUNCTION public.delete_user_entirely(target_user_id UUID)
RETURNS void AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Get caller role
  SELECT role INTO v_caller_role FROM public.members WHERE user_id = auth.uid();
  
  -- Prevent deletion if not admin
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can delete users entirely';
  END IF;

  -- Prevent deleting yourself
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Delete from auth.users (this will cascade to members and their projects if configured via FK)
  -- Or explicitly delete members row if cascade is not present
  DELETE FROM auth.users WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
