-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: UNIFIED CUSTOM HSP SYSTEM & LEGACY CLEANUP
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. CLEANUP LEGACY MASTER_LUMSUM
DROP TABLE IF EXISTS public.master_lumsum CASCADE;

-- 2. CREATE MASTER_AHSP_CUSTOM (Header)
-- Menyimpan header AHSP buatan user (Admin/Pro)
CREATE TABLE IF NOT EXISTS public.master_ahsp_custom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.members(user_id) ON DELETE CASCADE,
  kode_ahsp text NOT NULL,
  nama_pekerjaan text NOT NULL,
  satuan_pekerjaan text NOT NULL DEFAULT 'm2',
  divisi text,
  jenis_pekerjaan text,
  kategori_pekerjaan text DEFAULT 'Pekerjaan Persiapan',
  overhead_profit numeric(20, 2) NOT NULL DEFAULT 10,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. CREATE MASTER_AHSP_DETAILS_CUSTOM (Analysis Rows)
-- Menyimpan rincian analisa (item + koefisien)
CREATE TABLE IF NOT EXISTS public.master_ahsp_details_custom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ahsp_id uuid NOT NULL REFERENCES public.master_ahsp_custom(id) ON DELETE CASCADE,
  item_id uuid NOT NULL, -- ID dari master_harga_dasar ATAU master_harga_custom
  source_table text NOT NULL CHECK (source_table IN ('master_harga_dasar', 'master_harga_custom')),
  koefisien numeric(20, 5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS master_ahsp_custom_updated_at ON public.master_ahsp_custom;
CREATE TRIGGER master_ahsp_custom_updated_at
  BEFORE UPDATE ON public.master_ahsp_custom
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS POLICIES
ALTER TABLE public.master_ahsp_custom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_ahsp_details_custom ENABLE ROW LEVEL SECURITY;

-- Select: Admin sees all, User sees own or public
CREATE POLICY ahsp_custom_select ON public.master_ahsp_custom FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_public = true OR (SELECT role FROM public.members WHERE user_id = auth.uid()) = 'admin'
);

-- Insert/Update/Delete: Admin or Owner
CREATE POLICY ahsp_custom_mod ON public.master_ahsp_custom FOR ALL TO authenticated USING (
  user_id = auth.uid() OR (SELECT role FROM public.members WHERE user_id = auth.uid()) = 'admin'
);

-- Details follow header permissions
CREATE POLICY ahsp_details_custom_all ON public.master_ahsp_details_custom FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.master_ahsp_custom h WHERE h.id = ahsp_id AND (h.user_id = auth.uid() OR (SELECT role FROM public.members WHERE user_id = auth.uid()) = 'admin'))
);

-- 5. VIEW_KATALOG_AHSP_CUSTOM (Calculations)
-- View untuk menghitung total harga Custom HSP
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;
CREATE OR REPLACE VIEW public.view_katalog_ahsp_custom WITH (security_invoker = true) AS
WITH detail_calc AS (
  SELECT
    ac.id AS master_ahsp_id,
    ac.user_id,
    ac.kode_ahsp,
    ac.nama_pekerjaan,
    ac.satuan_pekerjaan,
    ac.kategori_pekerjaan,
    ac.jenis_pekerjaan,
    ac.overhead_profit,
    vmg.nama_item AS detail_uraian,
    vmg.satuan AS detail_satuan,
    vmg.kode_item AS detail_kode_item,
    vmg.kategori_item,
    vmg.urutan_prioritas,
    adc.koefisien,
    vmg.harga_satuan,
    vmg.tkdn_percent,
    (vmg.harga_satuan * adc.koefisien) AS subtotal,
    (vmg.harga_satuan * adc.koefisien * (vmg.tkdn_percent / 100.0)) AS nilai_tkdn
  FROM public.master_ahsp_custom ac
  JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
  JOIN public.view_master_harga_gabungan vmg ON vmg.id = adc.item_id AND vmg.source_table = adc.source_table
)
SELECT
  master_ahsp_id,
  user_id,
  kode_ahsp,
  MAX(nama_pekerjaan) AS nama_pekerjaan,
  MAX(satuan_pekerjaan) AS satuan_pekerjaan,
  MAX(kategori_pekerjaan) AS kategori_pekerjaan,
  MAX(jenis_pekerjaan) AS jenis_pekerjaan,
  MAX(overhead_profit) AS overhead_profit,
  SUM(CASE WHEN kategori_item = 'Upah'  THEN subtotal ELSE 0 END) AS total_upah,
  SUM(CASE WHEN kategori_item = 'Bahan' THEN subtotal ELSE 0 END) AS total_bahan,
  SUM(CASE WHEN kategori_item = 'Alat'  THEN subtotal ELSE 0 END) AS total_alat,
  SUM(subtotal) AS total_subtotal,
  CASE WHEN SUM(subtotal) > 0 THEN (SUM(nilai_tkdn) / SUM(subtotal)) * 100 ELSE 0 END AS total_tkdn_percent,
  true AS is_custom,
  1 AS urutan_prioritas,
  jsonb_agg(
    jsonb_build_object(
      'uraian', detail_uraian,
      'kode_item', detail_kode_item,
      'satuan', detail_satuan,
      'koefisien', koefisien,
      'harga_konversi', harga_satuan,
      'jenis_komponen', lower(kategori_item),
      'subtotal', subtotal,
      'tkdn', tkdn_percent
    )
  ) AS details
FROM detail_calc
GROUP BY master_ahsp_id, user_id, kode_ahsp;

-- 6. VIEW_KATALOG_AHSP_GABUNGAN (Final Union)
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
CREATE OR REPLACE VIEW public.view_katalog_ahsp_gabungan WITH (security_invoker = true) AS
SELECT
  master_ahsp_id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  kategori_pekerjaan,
  jenis_pekerjaan,
  overhead_profit,
  total_upah,
  total_bahan,
  total_alat,
  total_subtotal,
  total_tkdn_percent,
  true AS is_custom,
  1 AS urutan_prioritas,
  details,
  true AS is_lengkap -- Custom AHSP dianggap lengkap jika ada rinciannya
FROM public.view_katalog_ahsp_custom
UNION ALL
SELECT
  master_ahsp_id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  kategori_pekerjaan,
  jenis_pekerjaan,
  overhead_profit,
  total_upah,
  total_bahan,
  total_alat,
  total_subtotal,
  total_tkdn_percent,
  false AS is_custom,
  2 AS urutan_prioritas,
  details,
  is_lengkap
FROM public.view_katalog_ahsp_lengkap;

-- Update view_analisa_ahsp for legacy/external compatibility
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
CREATE OR REPLACE VIEW public.view_analisa_ahsp WITH (security_invoker = true) AS
SELECT
  master_ahsp_id AS id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  total_subtotal,
  total_upah,
  total_bahan,
  total_alat,
  total_tkdn_percent,
  is_lengkap,
  is_custom,
  urutan_prioritas
FROM public.view_katalog_ahsp_gabungan;

-- 7. RPC SAVE_CUSTOM_AHSP
-- Fungsi untuk menyimpan header dan rincian AHSP Custom sekaligus
CREATE OR REPLACE FUNCTION public.save_custom_ahsp(
  p_id uuid,
  p_kode text,
  p_nama text,
  p_satuan text,
  p_kategori text,
  p_profit numeric,
  p_details jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ahsp_id uuid;
  v_det jsonb;
BEGIN
  -- 1. Insert/Update Header
  IF p_id IS NULL THEN
    INSERT INTO public.master_ahsp_custom (user_id, kode_ahsp, nama_pekerjaan, satuan_pekerjaan, kategori_pekerjaan, overhead_profit)
    VALUES (auth.uid(), p_kode, p_nama, p_satuan, p_kategori, p_profit)
    RETURNING id INTO v_ahsp_id;
  ELSE
    UPDATE public.master_ahsp_custom
    SET kode_ahsp = p_kode,
        nama_pekerjaan = p_nama,
        satuan_pekerjaan = p_satuan,
        kategori_pekerjaan = p_kategori,
        overhead_profit = p_profit,
        updated_at = now()
    WHERE id = p_id AND (user_id = auth.uid() OR (SELECT role FROM public.members WHERE user_id = auth.uid()) = 'admin')
    RETURNING id INTO v_ahsp_id;
    
    IF v_ahsp_id IS NULL THEN
      RAISE EXCEPTION 'Akses ditolak atau data tidak ditemukan.';
    END IF;
  END IF;

  -- 2. Delete existing details for update
  DELETE FROM public.master_ahsp_details_custom WHERE ahsp_id = v_ahsp_id;

  -- 3. Insert new details
  FOR v_det IN SELECT * FROM jsonb_array_elements(p_details)
  LOOP
    INSERT INTO public.master_ahsp_details_custom (ahsp_id, item_id, source_table, koefisien)
    VALUES (v_ahsp_id, (v_det->>'item_id')::uuid, v_det->>'source_table', (v_det->>'koefisien')::numeric);
  END LOOP;

  RETURN v_ahsp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_custom_ahsp TO authenticated;
GRANT SELECT ON public.master_ahsp_custom TO authenticated;
GRANT SELECT ON public.master_ahsp_details_custom TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_custom TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;

NOTIFY pgrst, 'reload schema';
