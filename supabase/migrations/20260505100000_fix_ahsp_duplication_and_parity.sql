-- Migration: 20260505100000_FIX_AHSP_DUPLICATION_AND_PARITY
-- Goal: Eliminate duplicate resource entries and sync pricing between Katalog and Project views.

-- 1. DROP EXISTING VIEWS
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- -- 2. REBUILD VIEW_KATALOG_AHSP_LENGKAP
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
    COALESCE(mhd_ov.satuan, mhd_mk.satuan, mhd_auto.satuan, '') AS price_satuan,
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
    -- Smart Conversion: Jangan bagi faktor jika satuan harga sudah sama dengan satuan detail (mencegah double conversion 0.26)
    CASE 
      WHEN lower(trim(pr.detail_satuan)) = lower(trim(pr.price_satuan)) THEN pr.harga_toko
      ELSE (pr.harga_toko / pr.detail_faktor)
    END AS harga_efektif,
    (CASE WHEN lower(trim(pr.detail_satuan)) = lower(trim(pr.price_satuan)) THEN pr.harga_toko ELSE (pr.harga_toko / pr.detail_faktor) END * COALESCE(pr.koefisien, 0)) AS subtotal,
    (CASE WHEN lower(trim(pr.detail_satuan)) = lower(trim(pr.price_satuan)) THEN pr.harga_toko ELSE (pr.harga_toko / pr.detail_faktor) END * COALESCE(pr.koefisien, 0)) * (pr.detail_tkdn / 100.0) AS nilai_tkdn,
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
      'harga_konversi',  harga_efektif,
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
    COALESCE(mhd_loc.satuan, mhd_any.satuan, '') AS price_satuan,
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
    CASE 
      WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN harga_toko
      ELSE (harga_toko / detail_faktor)
    END AS harga_snapshot,
    tkdn_pct AS tkdn_percent,
    SUM(volume * koefisien)                                                  AS total_volume,
    SUM(volume * koefisien * (CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN harga_toko ELSE (harga_toko / detail_faktor) END)) AS kontribusi_nilai,
    SUM(volume * koefisien * (CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN harga_toko ELSE (harga_toko / detail_faktor) END) * (tkdn_pct / 100.0)) AS nilai_tkdn
  FROM resolved
  GROUP BY
    project_id, bab_pekerjaan, uraian_ahsp, satuan_uraian, jenis_komponen, kode_item, 
    CASE WHEN lower(trim(satuan_uraian)) = lower(trim(price_satuan)) THEN harga_toko ELSE (harga_toko / detail_faktor) END, 
    tkdn_pct
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

-- 5. REBUILD GET_AHSP_CATALOG_V2
-- High-performance RPC (Unified PUPR + Custom) with Parity and Deduplication.
CREATE OR REPLACE FUNCTION public.get_ahsp_catalog_v2(
  p_location_id uuid,
  p_query text DEFAULT '',
  p_jenis_filter text DEFAULT '',
  p_show_incomplete boolean DEFAULT false,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  master_ahsp_id uuid,
  user_id uuid,
  kode_ahsp text,
  nama_pekerjaan text,
  satuan_pekerjaan text,
  kategori_pekerjaan text,
  jenis_pekerjaan text,
  overhead_profit numeric,
  total_upah numeric,
  total_bahan numeric,
  total_alat numeric,
  total_subtotal numeric,
  total_tkdn_percent numeric,
  is_custom boolean,
  urutan_prioritas int,
  details jsonb,
  is_lengkap boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH official_base AS (
    SELECT
      ma.id as m_id,
      ma.kode_ahsp,
      ma.nama_pekerjaan,
      ma.divisi,
      ma.jenis_pekerjaan,
      ma.kategori_pekerjaan,
      ma.satuan_pekerjaan,
      COALESCE(ma.overhead_profit, 15::numeric) as overhead_profit,
      mad.id as detail_id,
      mad.uraian_ahsp as detail_uraian,
      mad.satuan_uraian as detail_satuan,
      mad.koefisien,
      mad.kode_item_dasar as ahsp_kode,
      COALESCE(NULLIF(mad.faktor_konversi, 0), 1) AS detail_faktor
    FROM public.master_ahsp ma
    LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
    WHERE (p_query = '' OR ma.nama_pekerjaan ILIKE '%' || p_query || '%' OR ma.kode_ahsp ILIKE '%' || p_query || '%')
      AND (p_jenis_filter = '' OR ma.jenis_pekerjaan ILIKE '%' || p_jenis_filter || '%')
  ),
  official_resolved AS (
    SELECT DISTINCT ON (ob.detail_id)
      ob.*,
      COALESCE(uapo.harga_langsung, mhc_glob.harga_satuan, mhd_mk.harga_satuan, mhd_auto.harga_satuan, 0::numeric) as harga_toko,
      COALESCE(uapo.tkdn_langsung, mhc_glob.tkdn_percent, mhd_mk.tkdn_percent, mhd_auto.tkdn_percent, 0::numeric) as tkdn_val,
      COALESCE(mhc_glob.kode_item, mhd_mk.kode_item, mhd_auto.kode_item, ob.ahsp_kode) as item_kode,
      COALESCE(mhd_mk.satuan, mhd_auto.satuan, '') as price_satuan
    FROM official_base ob
    LEFT JOIN public.user_ahsp_price_override uapo ON uapo.ahsp_detail_id = ob.detail_id AND uapo.user_id = v_user_id
    LEFT JOIN public.master_konversi mk ON mk.uraian_ahsp = ob.detail_uraian AND (mk.satuan_ahsp IS NOT DISTINCT FROM ob.detail_satuan)
    LEFT JOIN public.master_harga_dasar mhd_mk ON mhd_mk.id = mk.item_dasar_id AND mhd_mk.location_id = p_location_id
    LEFT JOIN public.master_harga_dasar mhd_auto ON mhd_auto.kode_item = ob.ahsp_kode AND mhd_auto.location_id = p_location_id
    LEFT JOIN public.master_harga_custom mhc_glob ON mhc_glob.overrides_harga_dasar_id = COALESCE(mhd_mk.id, mhd_auto.id) AND mhc_glob.user_id = v_user_id
    ORDER BY ob.detail_id, mhd_mk.location_id NULLS LAST, mhd_auto.location_id NULLS LAST
  ),
  official_summary AS (
    SELECT
      r.m_id,
      r.kode_ahsp,
      MAX(r.nama_pekerjaan) as nm,
      MAX(r.satuan_pekerjaan) as sat,
      MAX(r.kategori_pekerjaan) as kat,
      MAX(r.jenis_pekerjaan) as jen,
      MAX(r.overhead_profit) as prof,
      SUM(CASE WHEN upper(left(trim(r.item_kode),1)) = 'L' THEN (CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien ELSE 0 END) as upah,
      SUM(CASE WHEN upper(left(trim(r.item_kode),1)) IN ('A','B') THEN (CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien ELSE 0 END) as bahan,
      SUM(CASE WHEN upper(left(trim(r.item_kode),1)) = 'M' THEN (CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien ELSE 0 END) as alat,
      SUM((CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien) as subtotal,
      SUM((CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien * (r.tkdn_val/100.0)) as tkdn_sum,
      jsonb_agg(jsonb_build_object(
        'uraian', r.detail_uraian, 'detail_id', r.detail_id, 'kode_item', r.item_kode,
        'satuan', r.detail_satuan, 'koefisien', r.koefisien, 'harga_konversi', (CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END),
        'subtotal', (CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien, 'tkdn', r.tkdn_val,
        'jenis_komponen', CASE 
           WHEN upper(left(trim(r.item_kode),1)) = 'L' THEN 'upah'
           WHEN upper(left(trim(r.item_kode),1)) IN ('A','B') THEN 'bahan'
           WHEN upper(left(trim(r.item_kode),1)) = 'M' THEN 'alat'
           ELSE 'bahan'
        END
      )) FILTER (WHERE r.detail_uraian IS NOT NULL) as details_json,
      BOOL_AND((CASE WHEN lower(trim(r.detail_satuan)) = lower(trim(r.price_satuan)) THEN r.harga_toko ELSE (r.harga_toko/r.detail_faktor) END)*r.koefisien > 0) as complete
    FROM official_resolved r
    GROUP BY r.m_id, r.kode_ahsp
  ),
  custom_data AS (
    SELECT
      ac.id as m_id,
      ac.user_id,
      ac.kode_ahsp,
      ac.nama_pekerjaan,
      ac.satuan_pekerjaan,
      ac.kategori_pekerjaan,
      ac.jenis_pekerjaan,
      ac.overhead_profit,
      vmg.harga_satuan,
      vmg.tkdn_percent,
      vmg.kategori_item,
      vmg.kode_item,
      vmg.nama_item as detail_uraian,
      vmg.satuan as detail_satuan,
      adc.koefisien,
      adc.id as detail_id
    FROM public.master_ahsp_custom ac
    JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
    JOIN public.view_master_harga_gabungan vmg ON vmg.id = adc.item_id AND vmg.source_table = adc.source_table
    WHERE ac.user_id = v_user_id
  ),
  custom_summary AS (
    SELECT
      c.m_id,
      c.user_id,
      c.kode_ahsp,
      MAX(c.nama_pekerjaan) as nm,
      MAX(c.satuan_pekerjaan) as sat,
      MAX(c.kategori_pekerjaan) as kat,
      MAX(c.jenis_pekerjaan) as jen,
      MAX(c.overhead_profit) as prof,
      SUM(CASE WHEN c.kategori_item = 'Upah'  THEN c.harga_satuan*c.koefisien ELSE 0 END) as upah,
      SUM(CASE WHEN c.kategori_item = 'Bahan' THEN c.harga_satuan*c.koefisien ELSE 0 END) as bahan,
      SUM(CASE WHEN c.kategori_item = 'Alat'  THEN c.harga_satuan*c.koefisien ELSE 0 END) as alat,
      SUM(c.harga_satuan*c.koefisien) as subtotal,
      SUM(c.harga_satuan*c.koefisien*(c.tkdn_percent/100.0)) as tkdn_sum,
      jsonb_agg(jsonb_build_object(
        'uraian', c.detail_uraian, 'detail_id', c.detail_id, 'kode_item', c.kode_item,
        'satuan', c.detail_satuan, 'koefisien', c.koefisien, 'harga_konversi', c.harga_satuan,
        'subtotal', c.harga_satuan*c.koefisien, 'tkdn', c.tkdn_percent,
        'jenis_komponen', lower(c.kategori_item)
      )) as details_json
    FROM custom_data c
    GROUP BY c.m_id, c.user_id, c.kode_ahsp
  ),
  union_all AS (
     SELECT
       m_id as master_ahsp_id, user_id, kode_ahsp, nm as nama_pekerjaan, sat as satuan_pekerjaan,
       kat as kategori_pekerjaan, jen as jenis_pekerjaan, prof as overhead_profit,
       upah as total_upah, bahan as total_bahan, alat as total_alat, subtotal as total_subtotal,
       CASE WHEN subtotal > 0 THEN (tkdn_sum/subtotal)*100 ELSE 0 END as total_tkdn_percent,
       true as is_custom, 1 as urutan_prioritas, details_json as details, true as is_lengkap
     FROM custom_summary
     UNION ALL
     SELECT
       m_id as master_ahsp_id, NULL as user_id, kode_ahsp, nm as nama_pekerjaan, sat as satuan_pekerjaan,
       kat as kategori_pekerjaan, jen as jenis_pekerjaan, prof as overhead_profit,
       upah as total_upah, bahan as total_bahan, alat as total_alat, subtotal as total_subtotal,
       CASE WHEN subtotal > 0 THEN (tkdn_sum/subtotal)*100 ELSE 0 END as total_tkdn_percent,
       false as is_custom, 2 as urutan_prioritas, details_json as details, complete as is_lengkap
     FROM official_summary
  )
  SELECT * FROM union_all u
  WHERE (p_show_incomplete OR u.is_lengkap)
  ORDER BY u.urutan_prioritas, u.kode_ahsp
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 6. PERMISSIONS & SCHEMA RELOAD
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_project_resource_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
