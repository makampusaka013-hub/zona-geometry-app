-- =============================================================================
-- CONSOLIDATED MONITORING SYSTEM SETUP (REPAIR SCRIPT)
-- Order: Functions -> Tables -> Logic -> Policies
-- =============================================================================

-- 1. SECURITY HELPERS (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.member_can_read_project(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.member_can_write_project(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.member_can_read_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id 
      AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id 
      AND pm.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.member_can_write_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.members m ON m.user_id = auth.uid()
    WHERE p.id = p_project_id
      AND (p.user_id = auth.uid() OR p.created_by = auth.uid())
      AND m.role IN ('admin', 'pro', 'normal')
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.members m ON m.user_id = auth.uid()
    WHERE pm.project_id = p_project_id 
      AND pm.user_id = auth.uid()
      AND pm.can_write = true
      AND m.role IN ('admin', 'pro', 'normal')
  );
END;
$$;


-- 2. CORE MONITORING TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ahsp_line_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ahsp_line_id UUID NOT NULL REFERENCES public.ahsp_lines (id) ON DELETE CASCADE,
  uraian TEXT,
  kode_item TEXT,
  satuan TEXT,
  koefisien NUMERIC,
  harga_konversi NUMERIC,
  jenis_komponen TEXT,
  subtotal NUMERIC,
  tkdn NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.members (user_id) ON DELETE SET NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weather TEXT,
  notes TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, report_date)
);

CREATE TABLE IF NOT EXISTS public.daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports (id) ON DELETE CASCADE,
  ahsp_line_id UUID NOT NULL REFERENCES public.ahsp_lines (id) ON DELETE CASCADE,
  volume_achieved NUMERIC(20, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports (id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure master_ahsp_id exists in ahsp_lines
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS master_ahsp_id UUID REFERENCES public.master_ahsp(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_snapshots_line ON public.ahsp_line_snapshots (ahsp_line_id);


-- 3. UPDATED TRANSACTIONAL SAVE RPC (INCLUDES LIMIT & SNAPSHOT)
-- -----------------------------------------------------------------------------
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

  -- 3.1 Project Quota Limit (Max 3 for Pro)
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

  -- 3.2 Insert/Update Project Header
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
    DELETE FROM public.ahsp_lines WHERE project_id = v_project_id;
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

  -- 3.3 Insert Lines and AHSP Snapshots
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
      bab_pekerjaan TEXT,
      sort_order INTEGER,
      uraian TEXT,
      uraian_custom TEXT,
      satuan TEXT,
      volume NUMERIC,
      harga_satuan NUMERIC,
      jumlah NUMERIC,
      master_ahsp_id UUID
    )
    LOOP
      INSERT INTO public.ahsp_lines (
        project_id, master_ahsp_id, bab_pekerjaan, sort_order, uraian, uraian_custom, satuan, volume, harga_satuan, jumlah
      ) VALUES (
        v_project_id, r.master_ahsp_id, r.bab_pekerjaan, r.sort_order, r.uraian, r.uraian_custom, r.satuan, r.volume, r.harga_satuan, r.jumlah
      ) RETURNING id INTO v_new_line_id;

      IF r.master_ahsp_id IS NOT NULL THEN
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


-- 4. RLS POLICIES (Batas Keamanan Akhir)
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ahsp_line_snapshots ENABLE ROW LEVEL SECURITY;

-- daily_reports
DROP POLICY IF EXISTS daily_reports_select_if_readable ON public.daily_reports;
DROP POLICY IF EXISTS daily_reports_insert_if_writable ON public.daily_reports;
CREATE POLICY daily_reports_select_if_readable ON public.daily_reports FOR SELECT TO authenticated USING (public.member_can_read_project(project_id));
CREATE POLICY daily_reports_insert_if_writable ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (public.member_can_write_project(project_id));

-- daily_progress
DROP POLICY IF EXISTS daily_progress_select_if_readable ON public.daily_progress;
DROP POLICY IF EXISTS daily_progress_insert_if_writable ON public.daily_progress;
CREATE POLICY daily_progress_select_if_readable ON public.daily_progress FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_read_project(r.project_id)));
CREATE POLICY daily_progress_insert_if_writable ON public.daily_progress FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_write_project(r.project_id)));

-- project_photos
DROP POLICY IF EXISTS project_photos_select_if_readable ON public.project_photos;
DROP POLICY IF EXISTS project_photos_insert_if_writable ON public.project_photos;
CREATE POLICY project_photos_select_if_readable ON public.project_photos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_read_project(r.project_id)));
CREATE POLICY project_photos_insert_if_writable ON public.project_photos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM daily_reports r WHERE r.id = report_id AND public.member_can_write_project(r.project_id)));

-- ahsp_line_snapshots
DROP POLICY IF EXISTS snapshots_select_if_readable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_insert_if_writable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_update_if_writable ON public.ahsp_line_snapshots;
DROP POLICY IF EXISTS snapshots_delete_if_writable ON public.ahsp_line_snapshots;

CREATE POLICY snapshots_select_if_readable ON public.ahsp_line_snapshots FOR SELECT TO authenticated USING (public.member_can_read_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));
CREATE POLICY snapshots_insert_if_writable ON public.ahsp_line_snapshots FOR INSERT TO authenticated WITH CHECK (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));
CREATE POLICY snapshots_update_if_writable ON public.ahsp_line_snapshots FOR UPDATE TO authenticated USING (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));
CREATE POLICY snapshots_delete_if_writable ON public.ahsp_line_snapshots FOR DELETE TO authenticated USING (public.member_can_write_project((SELECT project_id FROM public.ahsp_lines WHERE id = ahsp_line_id)));

NOTIFY pgrst, 'reload schema';
