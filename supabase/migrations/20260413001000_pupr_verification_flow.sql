-- ============================================================
-- PUPR Standard Construction Supervision Workflow + Fix Code
-- Versi: 2026-04-13
-- Logic: Draft -> Verified (Consultant) -> Final (Instansi)
-- ============================================================

-- 0. Ensure unique_code column and helper functions exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.projects'::regclass
    AND attname = 'unique_code'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN unique_code text UNIQUE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_project_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END; $$;

-- Backfill missing codes
DO $$
DECLARE
  proj record;
  new_code text;
BEGIN
  FOR proj IN SELECT id FROM public.projects WHERE unique_code IS NULL LOOP
    LOOP
      new_code := public.generate_project_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.projects WHERE unique_code = new_code);
    END LOOP;
    UPDATE public.projects SET unique_code = new_code WHERE id = proj.id;
  END LOOP;
END $$;

-- Ensure Trigger for new projects
CREATE OR REPLACE FUNCTION public.projects_set_unique_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_code text;
BEGIN
  IF NEW.unique_code IS NOT NULL THEN RETURN NEW; END IF;
  LOOP
    new_code := generate_project_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.projects WHERE unique_code = new_code);
  END LOOP;
  NEW.unique_code := new_code;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS projects_auto_unique_code ON public.projects;
CREATE TRIGGER projects_auto_unique_code
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_set_unique_code();

-- Ensure other helper functions...

-- 0. Ensure Helper Function Exists
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

-- 1. Ensure column exists and UPDATE status_approval constraint to include 'verified'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.ahsp_lines'::regclass
    AND attname = 'status_approval'
  ) THEN
    ALTER TABLE public.ahsp_lines ADD COLUMN status_approval text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

ALTER TABLE public.ahsp_lines DROP CONSTRAINT IF EXISTS ahsp_lines_status_approval_check;
ALTER TABLE public.ahsp_lines ADD CONSTRAINT ahsp_lines_status_approval_check 
  CHECK (status_approval IN ('draft', 'verified', 'final'));

COMMENT ON COLUMN public.ahsp_lines.status_approval IS 'draft (Kontraktor), verified (Konsultan), final (Instansi). Data locked based on stakeholder stage.';

-- 2. RPC: set_line_verified
-- Only Consultant slot or Admin can verify a draft
CREATE OR REPLACE FUNCTION public.set_line_verified(p_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_slot       text;
  v_status     text;
BEGIN
  SELECT project_id, status_approval INTO v_project_id, v_status FROM public.ahsp_lines WHERE id = p_line_id;

  IF v_status <> 'draft' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya item berstatus DRAFT yang dapat diverifikasi.');
  END IF;

  v_slot := public.get_my_project_slot(v_project_id);

  IF v_slot <> 'konsultan' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya slot Konsultan Pengawas yang berwenang melakukan Verifikasi.');
  END IF;

  UPDATE public.ahsp_lines SET status_approval = 'verified' WHERE id = p_line_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_line_verified(uuid) TO authenticated;

-- 3. RPC: set_line_draft (Return to Draft)
-- Only Consultant/Admin can return a verified item back to draft if there are corrections
CREATE OR REPLACE FUNCTION public.set_line_draft(p_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_slot       text;
  v_status     text;
BEGIN
  SELECT project_id, status_approval INTO v_project_id, v_status FROM public.ahsp_lines WHERE id = p_line_id;

  IF v_status = 'final' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Item yang sudah FINAL tidak dapat dikembalikan ke DRAFT.');
  END IF;

  v_slot := public.get_my_project_slot(v_project_id);

  IF v_slot <> 'konsultan' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya slot Konsultan Pengawas yang berwenang mengembalikan ke DRAFT.');
  END IF;

  UPDATE public.ahsp_lines SET status_approval = 'draft' WHERE id = p_line_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_line_draft(uuid) TO authenticated;

-- 4. UPDATE RPC: set_line_final (instansi only)
-- Now strictly requires 'verified' status first, unless admin bypasses
CREATE OR REPLACE FUNCTION public.set_line_final(p_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_slot       text;
  v_status     text;
BEGIN
  SELECT project_id, status_approval INTO v_project_id, v_status FROM public.ahsp_lines WHERE id = p_line_id;

  IF v_status <> 'verified' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya item yang sudah di-VERIFIKASI konsultan yang dapat disetujui FINAL.');
  END IF;

  v_slot := public.get_my_project_slot(v_project_id);

  IF v_slot <> 'instansi' AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('error', 'Hanya slot Instansi (Owner) yang berwenang memberikan status FINAL.');
  END IF;

  UPDATE public.ahsp_lines SET status_approval = 'final' WHERE id = p_line_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. RLS Enforcement: ahsp_lines — lock non-draft items for Kontraktor
DROP POLICY IF EXISTS ahsp_lines_update_if_writable ON public.ahsp_lines;
CREATE POLICY ahsp_lines_update_if_writable
  ON public.ahsp_lines FOR UPDATE
  TO authenticated
  USING (
    (public.get_my_project_slot(project_id) = 'kontraktor' AND status_approval = 'draft')
    OR public.is_app_admin()
  )
  WITH CHECK (
    (public.get_my_project_slot(project_id) = 'kontraktor' AND status_approval = 'draft')
    OR public.is_app_admin()
  );

NOTIFY pgrst, 'reload schema';
