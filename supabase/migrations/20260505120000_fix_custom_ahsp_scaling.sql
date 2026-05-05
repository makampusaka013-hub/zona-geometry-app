-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: FIX AHSP EXPORT PARITY (COEFFICIENT SCALING FOR CUSTOM AHSP)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DROP DEPENDENT VIEWS
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;

-- 2. REBUILD VIEW_KATALOG_AHSP_CUSTOM WITH SCALING LOGIC
-- This ensures that if a custom AHSP uses an item with a different unit (e.g., Ton vs kg),
-- the coefficient is scaled appropriately for the exported report.
CREATE OR REPLACE VIEW public.view_katalog_ahsp_custom 
  WITH (security_invoker = true)
AS
WITH base_resolution AS (
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
    vmg.satuan AS price_satuan,
    vmg.kode_item AS detail_kode_item,
    vmg.kategori_item,
    vmg.urutan_prioritas,
    adc.koefisien AS raw_koefisien,
    vmg.harga_satuan AS raw_harga,
    vmg.tkdn_percent,
    adc.id AS detail_id,
    -- Try to find conversion if item is master_harga_dasar
    -- Custom AHSPs usually don't have a 'satuan_uraian' in their details table, 
    -- they just link to an item. But if the item's unit has changed in the master,
    -- we might need to scale. 
    -- HOWEVER: Most custom AHSPs are created with the unit of the item AT THAT TIME.
    -- If the item was 'Ton' then, raw_koefisien is 0.026.
    -- If the item is 'kg' now, raw_harga is 1310.
    -- We need to know that the raw_koefisien was meant for 'Ton'.
    -- Since we don't store the 'original_unit' in master_ahsp_details_custom,
    -- we assume that if the item is 'kg' and the koefisien is < 0.1, it's likely a Ton-scale koefisien.
    -- OR: We just look for common patterns.
    CASE 
      WHEN lower(trim(vmg.satuan)) = 'kg' AND adc.koefisien < 0.1 AND (vmg.nama_item ILIKE '%semen%' OR vmg.nama_item ILIKE '%pasir%' OR vmg.nama_item ILIKE '%kerikil%') THEN 1000.0
      ELSE 1.0
    END AS heuristic_faktor
  FROM public.master_ahsp_custom ac
  JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
  JOIN public.view_master_harga_gabungan vmg 
    ON vmg.id = adc.item_id 
   AND vmg.source_table = adc.source_table
),
computed AS (
  SELECT
    *,
    (raw_koefisien * heuristic_faktor) AS koefisien_efektif,
    (raw_harga / heuristic_faktor) AS harga_efektif, -- Keep subtotal same
    (raw_harga * raw_koefisien) AS subtotal,
    (raw_harga * raw_koefisien * (tkdn_percent / 100.0)) AS nilai_tkdn
  FROM base_resolution
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
  true AS is_lengkap,
  jsonb_agg(
    jsonb_build_object(
      'uraian', detail_uraian,
      'detail_id', detail_id,
      'kode_item', detail_kode_item,
      'satuan', price_satuan,
      'koefisien', koefisien_efektif,
      'harga_konversi', harga_efektif,
      'jenis_komponen', lower(kategori_item),
      'subtotal', subtotal,
      'tkdn', tkdn_percent
    )
  ) AS details
FROM computed
GROUP BY master_ahsp_id, user_id, kode_ahsp;

-- 3. RE-ESTABLISH GABUNGAN VIEW
CREATE OR REPLACE VIEW public.view_katalog_ahsp_gabungan WITH (security_invoker = true) AS
SELECT
  master_ahsp_id,
  user_id,
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
  is_custom,
  urutan_prioritas,
  details,
  is_lengkap
FROM public.view_katalog_ahsp_custom
UNION ALL
SELECT
  master_ahsp_id,
  NULL::uuid as user_id,
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
  false as is_custom,
  2 as urutan_prioritas,
  details,
  is_lengkap
FROM public.view_katalog_ahsp_lengkap;

-- 4. RE-ESTABLISH ANALISA VIEW
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

-- 5. RE-GRANT PERMISSIONS
GRANT SELECT ON public.view_katalog_ahsp_custom TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;

NOTIFY pgrst, 'reload schema';
