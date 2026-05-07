-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: COMPREHENSIVE PROJECT RESOURCE SUMMARY FIX
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DROP EXISTING VIEW IF EXISTS
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;

-- 2. CREATE THE NEW ROBUST VIEW
CREATE OR REPLACE VIEW public.view_project_resource_summary 
WITH (security_invoker = true) AS
WITH raw_resources AS (
  -- A. Dari Analisa Custom (Prioritas utama karena biasanya menyimpan detail atomik)
  SELECT
    al.project_id,
    p.location_id AS loc_id,
    al.volume AS proj_volume,
    det.uraian,
    det.kode_item,
    det.satuan,
    det.koefisien,
    det.jenis_komponen AS raw_jenis,
    det.tkdn AS raw_tkdn_pct,
    al.id AS line_id
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id,
  LATERAL jsonb_to_recordset(al.analisa_custom) AS det(
    uraian text, kode_item text, satuan text, koefisien numeric, tkdn numeric, jenis_komponen text
  )
  WHERE al.deleted_at IS NULL 
    AND al.analisa_custom IS NOT NULL 
    AND jsonb_array_length(al.analisa_custom) > 0

  UNION ALL

  -- B. Dari Snapshots (Fallback jika analisa_custom kosong)
  SELECT 
    al.project_id,
    p.location_id AS loc_id,
    al.volume AS proj_volume,
    s.uraian,
    s.kode_item,
    s.satuan,
    s.koefisien,
    s.jenis_komponen AS raw_jenis,
    s.tkdn AS raw_tkdn_pct,
    al.id AS line_id
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.ahsp_line_snapshots s ON s.ahsp_line_id = al.id
  WHERE al.deleted_at IS NULL
    AND (al.analisa_custom IS NULL OR jsonb_array_length(al.analisa_custom) = 0)
),
global_mapping AS (
  -- Tarik faktor konversi global jika ada mapping berdasarkan uraian & satuan
  SELECT
    r.*,
    mk.item_dasar_id AS mapped_item_id,
    mk.faktor_konversi AS global_faktor,
    mk.satuan_ahsp AS mapping_satuan
  FROM raw_resources r
  LEFT JOIN public.master_konversi mk ON 
    LOWER(TRIM(mk.uraian_ahsp)) = LOWER(TRIM(r.uraian)) AND 
    LOWER(TRIM(mk.satuan_ahsp)) = LOWER(TRIM(r.satuan))
),
resolved_prices AS (
  SELECT
    gm.*,
    -- 1. Cari Harga: Override Proyek > Harga Lokasi > Harga Terakhir
    COALESCE(mhc.harga_satuan, mhd_loc.harga_satuan, mhd_any.harga_satuan, 0) AS base_price,
    COALESCE(mhd_loc.satuan, mhd_any.satuan, gm.satuan) AS base_satuan,
    -- 2. Cari TKDN: Tabel Harga > Snapshot
    COALESCE(mhd_loc.tkdn_percent, mhd_any.tkdn_percent, gm.raw_tkdn_pct, 0) AS resolved_tkdn_pct
  FROM global_mapping gm
  -- Override spesifik proyek
  LEFT JOIN public.master_harga_custom mhc ON mhc.project_id = gm.project_id AND mhc.kode_item = gm.kode_item
  -- Harga sesuai lokasi proyek
  LEFT JOIN public.master_harga_dasar mhd_loc ON mhd_loc.kode_item = gm.kode_item AND mhd_loc.location_id = gm.loc_id
  -- Harga dari lokasi mana saja (fallback jika tidak ada di lokasi proyek)
  LEFT JOIN (
      SELECT DISTINCT ON (kode_item) kode_item, harga_satuan, satuan, tkdn_percent 
      FROM public.master_harga_dasar 
      ORDER BY kode_item, updated_at DESC
  ) mhd_any ON mhd_any.kode_item = gm.kode_item AND mhd_loc.id IS NULL
),
final_calculation AS (
  SELECT
    *,
    -- Tentukan faktor pembagi untuk konversi satuan
    COALESCE(NULLIF(global_faktor, 0), 1.0) AS divisor
  FROM resolved_prices
),
aggregated AS (
  SELECT
    project_id,
    uraian,
    kode_item AS key_item,
    satuan,
    CASE 
      WHEN LOWER(raw_jenis) IN ('upah', 'tenaga', 'labor', 'p') OR LEFT(kode_item, 1) = 'L' THEN 'tenaga'
      WHEN LOWER(raw_jenis) IN ('alat', 'equipment', 'm') OR LEFT(kode_item, 1) = 'M' THEN 'alat'
      ELSE 'bahan'
    END AS jenis_komponen,
    (base_price / divisor) AS resolved_unit_price,
    resolved_tkdn_pct,
    SUM(proj_volume * koefisien) AS total_volume,
    SUM(proj_volume * koefisien * (base_price / divisor)) AS kontribusi_nilai,
    SUM(proj_volume * koefisien * (base_price / divisor) * (resolved_tkdn_pct / 100.0)) AS nilai_tkdn
  FROM final_calculation
  GROUP BY project_id, uraian, kode_item, satuan, jenis_komponen, base_price, divisor, resolved_tkdn_pct
)
SELECT
  project_id,
  'TOTAL PROYEK' AS bab_pekerjaan, -- Legacy compatibility untuk frontend
  uraian,
  key_item,
  satuan,
  jenis_komponen,
  resolved_unit_price AS harga_snapshot,
  resolved_tkdn_pct AS tkdn_percent,
  resolved_tkdn_pct AS tkdn,
  total_volume,
  kontribusi_nilai,
  nilai_tkdn
FROM aggregated;

-- 3. PERMISSIONS
GRANT SELECT ON public.view_project_resource_summary TO authenticated;
GRANT SELECT ON public.view_project_resource_summary TO anon;
GRANT SELECT ON public.view_project_resource_summary TO service_role;

-- 4. RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
