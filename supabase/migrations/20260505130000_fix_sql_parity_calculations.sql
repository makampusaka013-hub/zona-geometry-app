-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: FIX SQL PARITY CALCULATIONS (SUBTOTAL & RESOURCE AGGREGATION)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DROP DEPENDENT VIEWS
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- 2. REBUILD view_katalog_ahsp_lengkap WITH CORRECT SCALING
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap 
  WITH (security_invoker = true)
AS
WITH price_resolution AS (
  SELECT
    ma.id AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.satuan_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.overhead_profit,
    mad.id AS ahsp_detail_id,
    mad.uraian_ahsp AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,
    mad.kode_item_dasar AS detail_kode_item,
    COALESCE(mhd.tkdn_percent, 0) AS detail_tkdn,
    COALESCE(mhd.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd.satuan, mad.satuan_uraian) AS price_satuan,
    COALESCE(NULLIF(mad.faktor_konversi, 0), 1.0) AS detail_faktor,
    CASE WHEN mhd.id IS NOT NULL THEN 'master_harga_dasar' ELSE 'manual' END AS sumber_harga
  FROM public.master_ahsp ma
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.master_harga_dasar mhd ON mhd.kode_item = mad.kode_item_dasar
),
computed AS (
  SELECT
    *,
    -- Harga Efektif: Always use the price from the store (market unit)
    -- Scaling is handled in the coefficient to keep logic consistent.
    harga_toko AS harga_efektif,
    
    -- Koefisien Efektif: Scale up if price unit is smaller (e.g. Ton to kg)
    CASE 
      WHEN lower(trim(detail_satuan)) = lower(trim(price_satuan)) THEN COALESCE(koefisien, 0)
      ELSE (COALESCE(koefisien, 0) * detail_faktor)
    END AS koefisien_efektif,
    
    -- Subtotal: (Koef * Faktor) * Harga
    (CASE 
      WHEN lower(trim(detail_satuan)) = lower(trim(price_satuan)) THEN (COALESCE(koefisien, 0) * harga_toko)
      ELSE (COALESCE(koefisien, 0) * detail_faktor * harga_toko)
    END) AS subtotal,
    
    (CASE 
      WHEN lower(trim(detail_satuan)) = lower(trim(price_satuan)) THEN (COALESCE(koefisien, 0) * harga_toko)
      ELSE (COALESCE(koefisien, 0) * detail_faktor * harga_toko)
    END) * (COALESCE(detail_tkdn, 0) / 100.0) AS nilai_tkdn,
    
    CASE
      WHEN upper(substring(trim(COALESCE(detail_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(detail_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(detail_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM price_resolution
),
final_agg AS (
  SELECT
    master_ahsp_id,
    kode_ahsp,
    MAX(nama_pekerjaan)     AS nama_pekerjaan,
    MAX(divisi)             AS divisi,
    MAX(jenis_pekerjaan)    AS jenis_pekerjaan,
    MAX(kategori_pekerjaan) AS kategori_pekerjaan,
    MAX(satuan_pekerjaan)   AS satuan_pekerjaan,
    MAX(overhead_profit)    AS overhead_profit,
    SUM(CASE WHEN jenis_komponen = 'upah'  THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_upah,
    SUM(CASE WHEN jenis_komponen = 'bahan' THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_bahan,
    SUM(CASE WHEN jenis_komponen = 'alat'  THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_alat,
    SUM(COALESCE(subtotal, 0))  AS total_subtotal,
    CASE WHEN SUM(COALESCE(subtotal, 0)) > 0 THEN (SUM(COALESCE(nilai_tkdn, 0)) / SUM(COALESCE(subtotal, 0))) * 100 ELSE 0 END AS total_tkdn_percent,
    jsonb_agg(
      jsonb_build_object(
        'uraian',          detail_uraian,
        'detail_id',       ahsp_detail_id,
        'kode_item',       detail_kode_item,
        'satuan',          price_satuan, -- USE THE PRICE UNIT FOR DISPLAY CONSISTENCY
        'koefisien',       koefisien_efektif,
        'harga_konversi',  harga_efektif,
        'jenis_komponen',  jenis_komponen,
        'subtotal',        subtotal,
        'tkdn',            detail_tkdn,
        'sumber_harga',    sumber_harga
      )
    ) FILTER (WHERE detail_uraian IS NOT NULL) AS details,
    true AS is_lengkap
  FROM computed
  GROUP BY master_ahsp_id, kode_ahsp
)
SELECT * FROM final_agg;

-- 3. REBUILD view_katalog_ahsp_custom WITH CORRECT SCALING
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
    -- Heuristic Scaling for Custom AHSP (Semen/Pasir Ton to kg)
    CASE 
      WHEN lower(trim(vmg.satuan)) = 'kg' AND adc.koefisien < 0.1 AND (vmg.nama_item ILIKE '%semen%' OR vmg.nama_item ILIKE '%pasir%' OR vmg.nama_item ILIKE '%kerikil%' OR vmg.nama_item ILIKE '%pc%') THEN 1000.0
      ELSE 1.0
    END AS heuristic_faktor
  FROM public.master_ahsp_custom ac
  JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
  JOIN public.view_master_harga_gabungan vmg ON vmg.id = adc.item_id AND vmg.source_table = adc.source_table
),
computed AS (
  SELECT
    *,
    (raw_koefisien * heuristic_faktor) AS koefisien_efektif,
    raw_harga AS harga_efektif,
    (raw_harga * raw_koefisien * heuristic_faktor) AS subtotal,
    (raw_harga * raw_koefisien * heuristic_faktor * (tkdn_percent / 100.0)) AS nilai_tkdn
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

-- 4. REBUILD view_katalog_ahsp_gabungan
CREATE OR REPLACE VIEW public.view_katalog_ahsp_gabungan WITH (security_invoker = true) AS
SELECT * FROM public.view_katalog_ahsp_custom
UNION ALL
SELECT
  master_ahsp_id,
  NULL AS user_id,
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

-- 5. REBUILD view_analisa_ahsp
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

-- 6. REBUILD view_project_resource_summary WITH CORRECT SCALING
CREATE OR REPLACE VIEW public.view_project_resource_summary 
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    al.project_id,
    p.location_id AS loc_id,
    al.volume AS proj_volume,
    al.bab_pekerjaan,
    mad.id AS ahsp_detail_id,
    mad.uraian_ahsp,
    mad.satuan_uraian,
    mad.koefisien,
    mad.kode_item_dasar,
    COALESCE(NULLIF(mad.faktor_konversi, 0), 1.0) AS detail_faktor
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.master_ahsp ma ON ma.id = al.master_ahsp_id
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  WHERE al.deleted_at IS NULL
),
resolved AS (
  SELECT DISTINCT ON (b.project_id, b.ahsp_detail_id, b.bab_pekerjaan)
    b.*,
    COALESCE(mhd_loc.kode_item, mhd_any.kode_item, b.kode_item_dasar) AS key_item,
    COALESCE(mhd_loc.harga_satuan, mhd_any.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd_loc.satuan, b.satuan_uraian) AS price_satuan,
    COALESCE(mhd_loc.tkdn_percent, mhd_any.tkdn_percent, 0) AS tkdn_pct
  FROM base b
  LEFT JOIN public.master_harga_dasar mhd_loc ON mhd_loc.kode_item = b.kode_item_dasar AND mhd_loc.location_id = b.loc_id
  LEFT JOIN public.master_harga_dasar mhd_any ON mhd_any.kode_item = b.kode_item_dasar AND mhd_loc.id IS NULL
  ORDER BY b.project_id, b.ahsp_detail_id, b.bab_pekerjaan, mhd_loc.location_id NULLS LAST
),
aggregated AS (
  SELECT
    project_id,
    bab_pekerjaan,
    uraian_ahsp,
    price_satuan AS satuan,
    CASE
      WHEN upper(left(trim(key_item), 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(left(trim(key_item), 1)) = 'L' THEN 'tenaga'
      WHEN upper(left(trim(key_item), 1)) = 'M' THEN 'alat'
      ELSE 'bahan'
    END AS jenis_komponen,
    key_item,
    harga_toko AS harga_snapshot,
    tkdn_pct AS tkdn_percent,
    -- CORRECT Volume Scaling
    SUM(proj_volume * (CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN koefisien ELSE (koefisien * detail_faktor) END)) AS total_volume,
    -- CORRECT Cost Calculation: (Vol * Scaled Koef) * Price
    SUM(proj_volume * (CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN koefisien ELSE (koefisien * detail_faktor) END) * harga_toko) AS kontribusi_nilai,
    -- CORRECT TKDN Value
    SUM(proj_volume * (CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN koefisien ELSE (koefisien * detail_faktor) END) * harga_toko * (tkdn_pct / 100.0)) AS nilai_tkdn
  FROM resolved
  GROUP BY project_id, bab_pekerjaan, uraian_ahsp, price_satuan, jenis_komponen, key_item, harga_toko, tkdn_pct
)
SELECT
  project_id,
  bab_pekerjaan,
  uraian,
  key_item,
  satuan,
  jenis_komponen,
  harga_snapshot,
  tkdn_percent,
  tkdn_percent AS tkdn,
  total_volume,
  kontribusi_nilai,
  nilai_tkdn
FROM aggregated;

-- 7. RE-GRANT PERMISSIONS
GRANT SELECT ON public.view_katalog_ahsp_lengkap TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_custom TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;
GRANT SELECT ON public.view_project_resource_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
