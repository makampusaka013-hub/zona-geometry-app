-- Migration: 20260505100000_FIX_AHSP_DUPLICATION_AND_PARITY
-- Goal: Eliminate duplicate resource entries and sync pricing between Katalog and Project views.

-- 1. DROP EXISTING VIEWS
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- 2. REBUILD VIEW_KATALOG_AHSP_LENGKAP
-- We use DISTINCT ON to ensure each AHSP Detail ID matches exactly one price source.
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap 
  WITH (security_invoker = true)
AS
WITH context AS (
  SELECT selected_location_id FROM public.members WHERE user_id = auth.uid()
),
base AS (
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
    mad.kode_item_dasar   AS ahsp_kode,
    COALESCE(NULLIF(mad.faktor_konversi, 0), 1) AS detail_faktor
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
),
price_resolution AS (
  SELECT DISTINCT ON (b.ahsp_detail_id)
    b.*,
    COALESCE(
      uapo.harga_langsung,
      mhc_ov.harga_satuan,
      mhd_ov.harga_satuan,
      mhc_glob.harga_satuan,
      mhd_mk.harga_satuan,
      mhd_auto.harga_satuan,
      0::numeric
    ) AS harga_toko,
    COALESCE(
      uapo.tkdn_langsung,
      mhc_ov.tkdn_percent,
      mhd_ov.tkdn_percent,
      mhc_glob.tkdn_percent,
      mhd_mk.tkdn_percent,
      mhd_auto.tkdn_percent,
      0::numeric
    ) AS detail_tkdn,
    COALESCE(
      mhc_ov.kode_item,
      mhd_ov.kode_item,
      mhc_glob.kode_item,
      mhd_mk.kode_item,
      mhd_auto.kode_item,
      b.ahsp_kode
    ) AS detail_kode_item,
    CASE
      WHEN uapo.harga_langsung IS NOT NULL     THEN 'override-langsung'
      WHEN uapo.harga_item_id IS NOT NULL      THEN 'override-custom'
      WHEN mhc_glob.harga_satuan IS NOT NULL   THEN 'override-global'
      WHEN mhd_mk.harga_satuan IS NOT NULL     THEN 'pupr-mapped'
      WHEN mhd_auto.harga_satuan IS NOT NULL   THEN 'pupr-auto'
      ELSE 'kosong'
    END AS sumber_harga
  FROM base b
  CROSS JOIN context ctx
  LEFT JOIN public.user_ahsp_price_override uapo
         ON uapo.ahsp_detail_id = b.ahsp_detail_id
        AND uapo.user_id = auth.uid()
  LEFT JOIN public.master_harga_dasar mhd_ov
         ON mhd_ov.id = uapo.harga_item_id 
        AND uapo.source_table = 'master_harga_dasar'
        AND mhd_ov.location_id = ctx.selected_location_id
  LEFT JOIN public.master_harga_custom mhc_ov
         ON mhc_ov.id = uapo.harga_item_id 
        AND uapo.source_table = 'master_harga_custom'
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp = b.detail_uraian
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM b.detail_satuan)
  LEFT JOIN public.master_harga_dasar mhd_mk 
         ON mhd_mk.id = mk.item_dasar_id
        AND mhd_mk.location_id = ctx.selected_location_id
  LEFT JOIN public.master_harga_dasar mhd_auto
         ON mhd_auto.kode_item = b.ahsp_kode
        AND mhd_auto.location_id = ctx.selected_location_id
  LEFT JOIN public.master_harga_custom mhc_glob
         ON mhc_glob.overrides_harga_dasar_id = COALESCE(mhd_mk.id, mhd_auto.id)
        AND mhc_glob.user_id = auth.uid()
  ORDER BY b.ahsp_detail_id, mhd_ov.location_id NULLS LAST, mhd_mk.location_id NULLS LAST, mhd_auto.location_id NULLS LAST
),
computed AS (
  SELECT
    pr.*,
    (pr.harga_toko / pr.detail_faktor) * COALESCE(pr.koefisien, 0) AS subtotal,
    ((pr.harga_toko / pr.detail_faktor) * COALESCE(pr.koefisien, 0)) * (pr.detail_tkdn / 100.0) AS nilai_tkdn,
    CASE
      WHEN upper(substring(trim(COALESCE(pr.detail_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(pr.detail_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(pr.detail_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM price_resolution pr
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
      'detail_id',       ahsp_detail_id,
      'kode_item',       detail_kode_item,
      'satuan',          detail_satuan,
      'koefisien',       koefisien,
      'harga_konversi',  (harga_toko / detail_faktor),
      'jenis_komponen',  jenis_komponen,
      'subtotal',        subtotal,
      'tkdn',            detail_tkdn,
      'sumber_harga',    sumber_harga
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
FROM computed
GROUP BY master_ahsp_id, kode_ahsp;


-- 3. RE-ESTABLISH GABUNGAN VIEW (Dependent on Katalog)
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


-- 4. REBUILD VIEW_PROJECT_RESOURCE_SUMMARY
-- Syncing logic with Katalog View to ensure Parity.
CREATE OR REPLACE VIEW public.view_project_resource_summary 
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    al.project_id,
    p.location_id AS loc_id,
    al.volume,
    al.bab_pekerjaan,
    mad.id AS ahsp_detail_id,
    mad.uraian_ahsp,
    mad.satuan_uraian,
    mad.koefisien,
    mad.kode_item_dasar,
    COALESCE(NULLIF(mad.faktor_konversi, 0), 1) AS detail_faktor
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.master_ahsp ma ON ma.id = al.master_ahsp_id
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  WHERE al.deleted_at IS NULL
),
resolved AS (
  SELECT DISTINCT ON (b.project_id, b.ahsp_detail_id, b.bab_pekerjaan)
    b.*,
    COALESCE(mhd_loc.kode_item, mhd_any.kode_item, b.kode_item_dasar) AS kode_item,
    COALESCE(mhd_loc.harga_satuan, mhd_any.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd_loc.tkdn_percent, mhd_any.tkdn_percent, 0) AS tkdn_pct
  FROM base b
  LEFT JOIN public.master_harga_dasar mhd_loc
    ON mhd_loc.kode_item = b.kode_item_dasar
   AND mhd_loc.location_id = b.loc_id
  LEFT JOIN public.master_harga_dasar mhd_any
    ON mhd_any.kode_item = b.kode_item_dasar
   AND mhd_loc.id IS NULL
  ORDER BY b.project_id, b.ahsp_detail_id, b.bab_pekerjaan, mhd_loc.location_id NULLS LAST
),
aggregated AS (
  SELECT
    project_id,
    bab_pekerjaan,
    uraian_ahsp,
    satuan_uraian,
    CASE
      WHEN upper(left(trim(kode_item), 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(left(trim(kode_item), 1)) = 'L' THEN 'tenaga'
      WHEN upper(left(trim(kode_item), 1)) = 'M' THEN 'alat'
      ELSE 'bahan'
    END AS jenis_komponen,
    kode_item AS key_item,
    (harga_toko / detail_faktor) AS harga_snapshot,
    tkdn_pct AS tkdn_percent,
    SUM(volume * koefisien)                                                  AS total_volume,
    SUM(volume * koefisien * (harga_toko / detail_faktor))                   AS kontribusi_nilai,
    SUM(volume * koefisien * (harga_toko / detail_faktor) * (tkdn_pct / 100.0)) AS nilai_tkdn
  FROM resolved
  GROUP BY
    project_id, bab_pekerjaan, uraian_ahsp, satuan_uraian, jenis_komponen, kode_item, (harga_toko / detail_faktor), tkdn_pct
)
SELECT
  project_id,
  bab_pekerjaan,
  uraian_ahsp    AS uraian,
  key_item,
  satuan_uraian  AS satuan,
  jenis_komponen,
  harga_snapshot,
  tkdn_percent,
  tkdn_percent   AS tkdn,
  total_volume,
  kontribusi_nilai,
  nilai_tkdn
FROM aggregated;

-- 5. PERMISSIONS & SCHEMA RELOAD
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_project_resource_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
