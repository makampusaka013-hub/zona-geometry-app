-- ============================================================
-- BuildCalc Core Overhaul: 3-Party Collaboration Role System
-- Versi: 2026-04-13
-- Features:
--   1. approval_status on members (pending, active, suspended)
--   2. unique_code on projects (auto-generated 8-char code)
--   3. slot_role on project_members (kontraktor, konsultan, instansi)
--   4. status_approval on ahsp_lines (draft, final)
--   5. RPC join_project_by_code
--   6. RPC reset_project_slot (Owner Management)
--   7. RLS: data locking + NORMAL read access in PRO projects
-- ============================================================

-- ============================================================
-- 1. ADD approval_status TO members
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.members'::regclass
    AND attname = 'approval_status'
  ) THEN
    ALTER TABLE public.members
      ADD COLUMN approval_status text NOT NULL DEFAULT 'pending'
      CONSTRAINT members_approval_status_check CHECK (approval_status IN ('pending', 'active', 'suspended'));
    -- Existing users with role pro/admin are automatically active
    UPDATE public.members SET approval_status = 'active'
      WHERE role IN ('admin', 'pro', 'normal');
    COMMENT ON COLUMN public.members.approval_status IS 'Admin must approve before user can access dashboard features.';
  END IF;
END $$;

-- ============================================================
-- 2. ADD unique_code TO projects
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.projects'::regclass
    AND attname = 'unique_code'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN unique_code text UNIQUE;
    COMMENT ON COLUMN public.projects.unique_code IS '8-char uppercase code for sharing project access with other PRO/NORMAL users.';
  END IF;
END $$;

-- Function to generate a random 8-char uppercase code
CREATE OR REPLACE FUNCTION public.generate_project_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Trigger to auto-set unique_code on new projects
CREATE OR REPLACE FUNCTION public.projects_set_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  attempts integer := 0;
BEGIN
  IF NEW.unique_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    new_code := generate_project_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.projects WHERE unique_code = new_code);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique project code after 20 attempts';
    END IF;
  END LOOP;
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_auto_unique_code ON public.projects;
CREATE TRIGGER projects_auto_unique_code
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_set_unique_code();

-- Backfill existing projects that don't have a code yet
DO $$
DECLARE
  proj record;
  new_code text;
BEGIN
  FOR proj IN SELECT id FROM public.projects WHERE unique_code IS NULL LOOP
    LOOP
      new_code := public.generate_project_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.projects WHERE unique_code = new_code AND id <> proj.id);
    END LOOP;
    UPDATE public.projects SET unique_code = new_code WHERE id = proj.id;
  END LOOP;
END $$;

-- ============================================================
-- 3. ADD slot_role TO project_members
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.project_members'::regclass
    AND attname = 'slot_role'
  ) THEN
    ALTER TABLE public.project_members
      ADD COLUMN slot_role text
      CONSTRAINT project_members_slot_role_check CHECK (slot_role IN ('kontraktor', 'konsultan', 'instansi'));
    COMMENT ON COLUMN public.project_members.slot_role IS 'Project-level role: kontraktor (input progress), konsultan (review), instansi (approve/final).';
  END IF;
END $$;

-- Unique constraint: only 1 person per slot per project
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_members_project_slot_unique'
    AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_project_slot_unique
      UNIQUE (project_id, slot_role);
  END IF;
END $$;

-- ============================================================
-- 4. ADD status_approval TO ahsp_lines
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.ahsp_lines'::regclass
    AND attname = 'status_approval'
  ) THEN
    ALTER TABLE public.ahsp_lines
      ADD COLUMN status_approval text NOT NULL DEFAULT 'draft'
      CONSTRAINT ahsp_lines_status_approval_check CHECK (status_approval IN ('draft', 'final'));
    COMMENT ON COLUMN public.ahsp_lines.status_approval IS 'Only instansi slot user can set to final. Final items are immutable for all roles.';
  END IF;
END $$;

-- ============================================================
-- 5. HELPER FUNCTION: get current user's slot_role in a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_project_slot(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slot_role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = auth.uid()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_project_slot(uuid) TO authenticated;

-- ============================================================
-- 6. HELPER FUNCTION: count user's active projects
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_my_projects()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.project_members
  WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.count_my_projects() TO authenticated;

-- ============================================================
-- 7. RPC: join_project_by_code
--    Validates: slot availability, project limit (max 3), not already member
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_project_by_code(
  p_code    text,
  p_slot    text   -- 'kontraktor' | 'konsultan' | 'instansi'
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
  v_count      integer;
BEGIN
  -- Validate slot value
  IF p_slot NOT IN ('kontraktor', 'konsultan', 'instansi') THEN
    RETURN jsonb_build_object('error', 'Slot tidak valid. Pilih: kontraktor, konsultan, atau instansi.');
  END IF;

  -- Get caller's role
  SELECT role INTO v_user_role FROM public.members WHERE user_id = v_user_id;

  IF v_user_role NOT IN ('pro', 'normal', 'admin') THEN
    RETURN jsonb_build_object('error', 'Akun Anda tidak memiliki hak akses untuk bergabung ke proyek.');
  END IF;

  -- Check approval status
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE user_id = v_user_id AND approval_status = 'active') THEN
    RETURN jsonb_build_object('error', 'Akun Anda belum diaktifkan oleh Admin.');
  END IF;

  -- Find project by code
  SELECT id INTO v_project_id FROM public.projects WHERE unique_code = upper(trim(p_code));
  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Kode proyek tidak ditemukan. Periksa kembali kode yang Anda masukkan.');
  END IF;

  -- Check: Already a member?
  IF EXISTS (SELECT 1 FROM public.project_members WHERE project_id = v_project_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('error', 'Anda sudah terdaftar dalam proyek ini.');
  END IF;

  -- Check: Slot already filled?
  IF EXISTS (SELECT 1 FROM public.project_members WHERE project_id = v_project_id AND slot_role = p_slot) THEN
    RETURN jsonb_build_object('error', 'Slot ' || p_slot || ' pada proyek ini sudah terisi.');
  END IF;

  -- Check: Project limit reached (max 3)
  SELECT COUNT(*)::integer INTO v_count FROM public.project_members WHERE user_id = v_user_id;
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('error', 'Anda sudah terdaftar di 3 proyek. Hapus salah satu proyek untuk bergabung.');
  END IF;

  -- Insert into project_members
  INSERT INTO public.project_members (project_id, user_id, slot_role, can_write, assigned_at)
  VALUES (v_project_id, v_user_id, p_slot, true, now());

  RETURN jsonb_build_object('success', true, 'project_id', v_project_id, 'slot', p_slot);
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_project_by_code(text, text) TO authenticated;

-- ============================================================
-- 8. RPC: reset_project_slot (Owner Management)
--    Only project creator can reset a slot
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_project_slot(
  p_project_id uuid,
  p_slot_role  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_caller  uuid := auth.uid();
BEGIN
  -- Only creator or admin can reset
  SELECT created_by INTO v_creator FROM public.projects WHERE id = p_project_id;

  IF v_creator IS DISTINCT FROM v_caller AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya pembuat proyek atau admin yang dapat mereset slot.');
  END IF;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND slot_role = p_slot_role;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_project_slot(uuid, text) TO authenticated;

-- ============================================================
-- 9. RPC: get_project_slots (list all slots and their users)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_project_slots(p_project_id uuid)
RETURNS TABLE (
  slot_role   text,
  user_id     uuid,
  full_name   text,
  joined_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pm.slot_role,
    pm.user_id,
    m.full_name,
    pm.assigned_at as joined_at
  FROM public.project_members pm
  LEFT JOIN public.members m ON m.user_id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND pm.slot_role IS NOT NULL
  ORDER BY pm.slot_role;
$$;
GRANT EXECUTE ON FUNCTION public.get_project_slots(uuid) TO authenticated;

-- ============================================================
-- 10. RLS UPDATE: ahsp_lines — protect FINAL items
-- ============================================================

-- Drop and recreate the update policy for ahsp_lines to block edits on FINAL items
DROP POLICY IF EXISTS ahsp_lines_update_if_writable ON public.ahsp_lines;
CREATE POLICY ahsp_lines_update_if_writable
  ON public.ahsp_lines FOR UPDATE
  TO authenticated
  USING (
    status_approval = 'draft'
    AND (
      public.is_app_admin()
      OR public.member_can_write_project(project_id)
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.member_can_write_project(project_id)
  );

-- Allow instansi slot users to set status_approval = 'final'
-- This is enforced via the API/RPC below since column-level security is complex.
CREATE OR REPLACE FUNCTION public.set_line_final(p_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_slot       text;
BEGIN
  SELECT project_id INTO v_project_id FROM public.ahsp_lines WHERE id = p_line_id;

  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Item tidak ditemukan.');
  END IF;

  v_slot := public.get_my_project_slot(v_project_id);

  IF v_slot <> 'instansi' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya slot Instansi yang berwenang memberikan status FINAL.');
  END IF;

  UPDATE public.ahsp_lines SET status_approval = 'final' WHERE id = p_line_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_line_final(uuid) TO authenticated;

-- ============================================================
-- 11. NORMAL users in PRO projects: Allow reading schedule/manpower data
-- ============================================================
-- The existing member_can_read_project function already allows all project_members to read.
-- This is already correct from the initial schema.
-- The project_details, ahsp_lines select policies use member_can_read_project which covers NORMAL.
-- No additional SELECT policy changes needed — NORMAL can already read as long as they are in project_members.

-- ============================================================
-- 12. Update project count enforcement view (utility)
-- ============================================================
CREATE OR REPLACE VIEW public.my_project_count AS
  SELECT COUNT(*)::integer AS total
  FROM public.project_members
  WHERE user_id = auth.uid();
GRANT SELECT ON public.my_project_count TO authenticated;

-- ============================================================
-- Done
-- ============================================================
COMMENT ON FUNCTION public.join_project_by_code(text, text) IS 'RPC to join a project using its unique code and choose a slot (kontraktor/konsultan/instansi).';
COMMENT ON FUNCTION public.reset_project_slot(uuid, text) IS 'Owner/Admin can remove a user from a slot to free up space.';
COMMENT ON FUNCTION public.set_line_final(uuid) IS 'Only instansi slot users can lock an ahsp_line item as FINAL.';
