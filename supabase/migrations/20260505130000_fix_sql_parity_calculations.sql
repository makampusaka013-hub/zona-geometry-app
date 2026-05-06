-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: FIX SQL PARITY CALCULATIONS (SMART FALLBACK CONVERSION)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DROP DEPENDENT VIEWS
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- 2. REBUILD view_katalog_ahsp_lengkap (SENTRALISASI SEBAGAI RAJA)
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap 
  WITH (security_invoker = true)
AS
WITH base_data AS (
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
    mad.faktor_konversi AS raw_faktor
  FROM public.master_ahsp ma
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
),
global_mapping AS (
  SELECT
    b.*,
    -- Ambil mapping dari Sentralisasi jika ada
    mk.item_dasar_id AS mapped_item_id,
    mk.faktor_konversi AS global_faktor
  FROM base_data b
  LEFT JOIN public.master_konversi mk ON 
    LOWER(TRIM(mk.uraian_ahsp)) = LOWER(TRIM(b.detail_uraian)) AND 
    LOWER(TRIM(mk.satuan_ahsp)) = LOWER(TRIM(b.detail_satuan))
),
price_resolution AS (
  SELECT
    gm.*,
    -- Prioritaskan item yang di-map di Sentralisasi, fallback ke kode item asli
    COALESCE(mhd_mapped.id, mhd_orig.id) AS price_item_id,
    COALESCE(mhd_mapped.harga_satuan, mhd_orig.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd_mapped.satuan, mhd_orig.satuan) AS price_satuan,
    COALESCE(mhd_mapped.tkdn_percent, mhd_orig.tkdn_percent, 0) AS detail_tkdn,
    COALESCE(mhd_mapped.kode_item, mhd_orig.kode_item) AS resolved_kode_item
  FROM global_mapping gm
  LEFT JOIN public.master_harga_dasar mhd_mapped ON mhd_mapped.id = gm.mapped_item_id
  LEFT JOIN public.master_harga_dasar mhd_orig ON mhd_orig.kode_item = gm.detail_kode_item AND gm.mapped_item_id IS NULL
),
factor_computation AS (
  SELECT
    *,
    CASE 
      -- A. JIKA SATUAN SAMA: Paksa 1.0
      WHEN LOWER(TRIM(detail_satuan)) = LOWER(TRIM(COALESCE(price_satuan, detail_satuan))) THEN 1.0
      -- B. PRIORITAS 1: Gunakan Faktor dari halaman Sentralisasi
      WHEN global_faktor IS NOT NULL AND global_faktor <> 0 THEN global_faktor
      -- C. PRIORITAS 2: Gunakan Faktor dari AHSP (Fallback)
      WHEN COALESCE(raw_faktor, 1.0) <> 1.0 THEN raw_faktor
      ELSE 1.0
    END AS detail_faktor
  FROM price_resolution
),
computed AS (
  SELECT
    *,
    COALESCE(koefisien, 0) AS koefisien_efektif,
    (harga_toko / detail_faktor) AS harga_efektif,
    (COALESCE(koefisien, 0) * (harga_toko / detail_faktor)) AS subtotal,
    (COALESCE(koefisien, 0) * (harga_toko / detail_faktor)) * (COALESCE(detail_tkdn, 0) / 100.0) AS nilai_tkdn,
    CASE
      WHEN upper(substring(trim(COALESCE(resolved_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(resolved_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(resolved_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM factor_computation
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
        'kode_item',       resolved_kode_item,
        'satuan',          detail_satuan,
        'koefisien',       koefisien_efektif,
        'harga_konversi',  harga_efektif,
        'jenis_komponen',  jenis_komponen,
        'subtotal',        subtotal,
        'tkdn',            detail_tkdn,
        'faktor_used',     detail_faktor
      )
    ) FILTER (WHERE detail_uraian IS NOT NULL) AS details,
    true AS is_lengkap
  FROM computed
  GROUP BY master_ahsp_id, kode_ahsp
)
SELECT * FROM final_agg;

-- 3. REBUILD view_katalog_ahsp_custom
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
    vmg.id AS price_item_id
  FROM public.master_ahsp_custom ac
  JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
  JOIN public.view_master_harga_gabungan vmg ON vmg.id = adc.item_id AND vmg.source_table = adc.source_table
),
factor_computation AS (
  SELECT
    *,
    CASE 
      WHEN LOWER(TRIM(price_satuan)) = LOWER(TRIM(price_satuan)) THEN 1.0
      ELSE COALESCE((
        SELECT mk.faktor_konversi 
        FROM public.master_konversi mk 
        WHERE mk.item_dasar_id = price_item_id 
          AND LOWER(TRIM(mk.uraian_ahsp)) = LOWER(TRIM(detail_uraian))
          AND LOWER(TRIM(mk.satuan_ahsp)) = LOWER(TRIM(price_satuan))
        LIMIT 1
      ), 1.0)
    END AS global_faktor
  FROM base_resolution
),
computed AS (
  SELECT
    *,
    raw_koefisien AS koefisien_efektif,
    (raw_harga / global_faktor) AS harga_efektif,
    (raw_koefisien * (raw_harga / global_faktor)) AS subtotal,
    (raw_koefisien * (raw_harga / global_faktor) * (tkdn_percent / 100.0)) AS nilai_tkdn
  FROM factor_computation
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
  is_lengkap,
  details
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

-- 6. REBUILD view_project_resource_summary (SENTRALISASI SEBAGAI RAJA)
CREATE OR REPLACE VIEW public.view_project_resource_summary 
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    al.project_id,
    p.location_id AS loc_id,
    al.volume AS proj_volume,
    mad.id AS ahsp_detail_id,
    mad.uraian_ahsp,
    mad.satuan_uraian,
    mad.koefisien,
    mad.kode_item_dasar,
    mad.faktor_konversi AS raw_faktor
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.master_ahsp ma ON ma.id = al.master_ahsp_id
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  WHERE al.deleted_at IS NULL
),
global_mapping AS (
  SELECT
    b.*,
    mk.item_dasar_id AS mapped_item_id,
    mk.faktor_konversi AS global_faktor
  FROM base b
  LEFT JOIN public.master_konversi mk ON 
    LOWER(TRIM(mk.uraian_ahsp)) = LOWER(TRIM(b.uraian_ahsp)) AND 
    LOWER(TRIM(mk.satuan_ahsp)) = LOWER(TRIM(b.satuan_uraian))
),
resolved AS (
  SELECT
    gm.*,
    COALESCE(mhd_mapped.id, mhd_loc.id, mhd_any.id) AS price_item_id,
    COALESCE(mhd_mapped.kode_item, mhd_loc.kode_item, mhd_any.kode_item, gm.kode_item_dasar) AS resolved_kode_item,
    COALESCE(mhd_mapped.harga_satuan, mhd_loc.harga_satuan, mhd_any.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd_mapped.satuan, mhd_loc.satuan, mhd_any.satuan, gm.satuan_uraian) AS price_satuan,
    COALESCE(mhd_mapped.tkdn_percent, mhd_loc.tkdn_percent, mhd_any.tkdn_percent, 0) AS tkdn_pct
  FROM global_mapping gm
  LEFT JOIN public.master_harga_dasar mhd_mapped ON mhd_mapped.id = gm.mapped_item_id
  LEFT JOIN public.master_harga_dasar mhd_loc ON mhd_loc.kode_item = gm.kode_item_dasar AND mhd_loc.location_id = gm.loc_id AND gm.mapped_item_id IS NULL
  LEFT JOIN public.master_harga_dasar mhd_any ON mhd_any.kode_item = gm.kode_item_dasar AND mhd_loc.id IS NULL AND gm.mapped_item_id IS NULL
),
factor_computation AS (
  SELECT
    *,
    CASE
      WHEN LOWER(TRIM(satuan_uraian)) = LOWER(TRIM(price_satuan)) THEN 1.0
      WHEN global_faktor IS NOT NULL AND global_faktor <> 0 THEN global_faktor
      WHEN COALESCE(raw_faktor, 1.0) <> 1.0 THEN raw_faktor
      ELSE 1.0
    END AS detail_faktor
  FROM resolved
),
aggregated AS (
  SELECT
    project_id,
    uraian_ahsp AS uraian,
    resolved_kode_item AS key_item,
    satuan_uraian AS satuan,
    CASE
      WHEN upper(left(trim(resolved_kode_item), 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(left(trim(resolved_kode_item), 1)) = 'L' THEN 'tenaga'
      WHEN upper(left(trim(resolved_kode_item), 1)) = 'M' THEN 'alat'
      ELSE 'bahan'
    END AS jenis_komponen,
    detail_faktor,
    harga_toko,
    tkdn_pct AS tkdn_percent,
    SUM(proj_volume * koefisien) AS total_volume,
    SUM(proj_volume * koefisien * (harga_toko / detail_faktor)) AS kontribusi_nilai,
    SUM(proj_volume * koefisien * (harga_toko / detail_faktor) * (tkdn_pct / 100.0)) AS nilai_tkdn
  FROM factor_computation
  GROUP BY project_id, uraian_ahsp, resolved_kode_item, satuan_uraian, jenis_komponen, harga_toko, detail_faktor, tkdn_pct
)
SELECT
  project_id,
  'TOTAL PROYEK' AS bab_pekerjaan,
  uraian,
  key_item,
  satuan,
  jenis_komponen,
  (harga_toko / detail_faktor) AS harga_snapshot,
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
