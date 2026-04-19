-- =============================================================================
-- MIGRATION: 20260416130000_FIX_AHSP_VIEW_OVERRIDES_REGRESSION
-- RESTORING: Detail ID and 5-Layer Price Resolution Logic
-- =============================================================================

-- 1. DROP EXISTING VIEWS (to be rebuilt)
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;

-- 2. REBUILD VIEW_KATALOG_AHSP_LENGKAP (Standard PUPR with Overrides)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap 
  WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    ma.id                 AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit,
    mad.id                AS ahsp_detail_id,
    mad.uraian_ahsp       AS detail_uraian,
    mad.satuan_uraian     AS detail_satuan,
    mad.koefisien,
    mad.kode_item_dasar   AS ahsp_kode
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
),
-- LAYER 0: Per-detail specific items overrides
lvl0 AS (
  SELECT
    b.*,
    uapo.harga_item_id    AS ov0_item_id,
    uapo.source_table     AS ov0_source,
    uapo.harga_langsung   AS ov0_harga_direct,
    uapo.tkdn_langsung    AS ov0_tkdn_direct
  FROM base b
  LEFT JOIN public.user_ahsp_price_override uapo
         ON uapo.ahsp_detail_id = b.ahsp_detail_id
        AND uapo.user_id = auth.uid()
),
-- Resolve harga for Layer 0
lvl0_resolved AS (
  SELECT
    l.*,
    mhd_ov.harga_satuan  AS ov0_harga_pupr,
    mhd_ov.tkdn_percent  AS ov0_tkdn_pupr,
    mhd_ov.kode_item     AS ov0_kode_pupr,
    mhc_ov.harga_satuan  AS ov0_harga_custom,
    mhc_ov.tkdn_percent  AS ov0_tkdn_custom,
    mhc_ov.kode_item     AS ov0_kode_custom
  FROM lvl0 l
  LEFT JOIN public.master_harga_dasar mhd_ov
         ON mhd_ov.id = l.ov0_item_id AND l.ov0_source = 'master_harga_dasar'
  LEFT JOIN public.master_harga_custom mhc_ov
         ON mhc_ov.id = l.ov0_item_id AND l.ov0_source = 'master_harga_custom'
),
-- LAYER 1-3: PUPR default + global override + konversi mapping
base_price AS (
  SELECT
    l.*,
    -- Global override per item PUPR
    mhc_glob.harga_satuan AS glob_harga,
    mhc_glob.tkdn_percent AS glob_tkdn,
    mhc_glob.kode_item    AS glob_kode,
    -- Admin Mapping
    mk.faktor_konversi,
    mhd_mk.harga_satuan   AS mk_harga,
    mhd_mk.tkdn_percent   AS mk_tkdn,
    mhd_mk.kode_item      AS mk_kode,
    mhd_mk.id             AS mk_pupr_id,
    -- Auto-match
    mhd_auto.harga_satuan AS auto_harga,
    mhd_auto.tkdn_percent AS auto_tkdn,
    mhd_auto.kode_item    AS auto_kode
  FROM lvl0_resolved l
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp = l.detail_uraian
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM l.detail_satuan)
  LEFT JOIN public.master_harga_dasar mhd_mk ON mhd_mk.id = mk.item_dasar_id
  LEFT JOIN public.master_harga_dasar mhd_auto
         ON mhd_auto.kode_item = l.ahsp_kode
        AND mhd_mk.id IS NULL
  LEFT JOIN public.master_harga_custom mhc_glob
         ON mhc_glob.overrides_harga_dasar_id = COALESCE(mhd_mk.id, mhd_auto.id)
        AND mhc_glob.user_id = auth.uid()
),
-- Resolve Final Price (5-Level COALESCE)
final_calc AS (
  SELECT
    bp.*,
    COALESCE(
      bp.ov0_harga_direct,           -- 0a: direct override
      bp.ov0_harga_custom,           -- 0b: custom item manual pick
      bp.ov0_harga_pupr,             -- 0c: PUPR item manual pick
      bp.glob_harga,                 -- 1:  global override
      bp.mk_harga,                   -- 2:  admin mapping
      bp.auto_harga,                 -- 3:  auto-match
      0::numeric
    ) AS harga_toko,

    COALESCE(
      bp.ov0_tkdn_direct,
      bp.ov0_tkdn_custom,
      bp.ov0_tkdn_pupr,
      bp.glob_tkdn,
      bp.mk_tkdn,
      bp.auto_tkdn,
      0::numeric
    ) AS detail_tkdn,

    COALESCE(
      bp.ov0_kode_custom,
      bp.ov0_kode_pupr,
      bp.glob_kode,
      bp.mk_kode,
      bp.auto_kode
    ) AS detail_kode_item,

    COALESCE(NULLIF(bp.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,

    CASE
      WHEN bp.ov0_harga_direct IS NOT NULL     THEN 'override-langsung'
      WHEN bp.ov0_item_id IS NOT NULL          THEN 'override-custom'
      WHEN bp.glob_harga IS NOT NULL           THEN 'override-global'
      WHEN bp.mk_harga IS NOT NULL             THEN 'pupr-mapped'
      WHEN bp.auto_harga IS NOT NULL           THEN 'pupr-auto'
      ELSE 'kosong'
    END AS sumber_harga

  FROM base_price bp
),
computed AS (
  SELECT
    fc.*,
    (fc.harga_toko / fc.faktor_efektif) * COALESCE(fc.koefisien, 0) AS subtotal,
    ((fc.harga_toko / fc.faktor_efektif) * COALESCE(fc.koefisien, 0)) * (fc.detail_tkdn / 100.0) AS nilai_tkdn,
    CASE
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM final_calc fc
)
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
  MIN(COALESCE(subtotal, 0))  AS min_subtotal_item,
  CASE
    WHEN MIN(COALESCE(subtotal, 0)) > 0 AND SUM(COALESCE(subtotal, 0)) > 0 THEN true
    ELSE false
  END AS is_lengkap,
  CASE WHEN SUM(COALESCE(subtotal, 0)) > 0
       THEN (SUM(COALESCE(nilai_tkdn, 0)) / SUM(COALESCE(subtotal, 0))) * 100
       ELSE 0
  END AS total_tkdn_percent,
  jsonb_agg(
    jsonb_build_object(
      'uraian',          detail_uraian,
      'detail_id',       ahsp_detail_id,   -- RESTORED
      'kode_item',       detail_kode_item,
      'satuan',          detail_satuan,
      'koefisien',       koefisien,
      'harga_konversi',  (harga_toko / faktor_efektif),
      'jenis_komponen',  jenis_komponen,
      'subtotal',        subtotal,
      'tkdn',            detail_tkdn,
      'sumber_harga',    sumber_harga     -- RESTORED
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
FROM computed
GROUP BY master_ahsp_id, kode_ahsp;

-- 3. REBUILD VIEW_KATALOG_AHSP_CUSTOM (User Created AHSP)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_katalog_ahsp_custom 
  WITH (security_invoker = true)
AS
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
    adc.id AS detail_id,  -- RESTORED
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
  true AS is_lengkap, -- RESTORED
  jsonb_agg(
    jsonb_build_object(
      'uraian', detail_uraian,
      'detail_id', detail_id, -- RESTORED
      'kode_item', detail_kode_item,
      'satuan', detail_satuan,
      'koefisien', koefisien,
      'harga_konversi', harga_satuan,
      'jenis_komponen', lower(kategori_item),
      'subtotal', subtotal,
      'tkdn', tkdn_percent,
      'sumber_harga', 'custom' -- RESTORED
    )
  ) AS details
FROM detail_calc
GROUP BY master_ahsp_id, user_id, kode_ahsp;

-- 4. REBUILD VIEW_KATALOG_AHSP_GABUNGAN (Final Union)
-- -----------------------------------------------------------------------------
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

-- 5. REBUILD VIEW_ANALISA_AHSP (Compatibility)
-- -----------------------------------------------------------------------------
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

-- Permissions
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;

-- Reload Schema
NOTIFY pgrst, 'reload schema';
