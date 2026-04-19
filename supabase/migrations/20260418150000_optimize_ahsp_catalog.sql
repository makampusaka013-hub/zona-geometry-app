-- =============================================================================
-- MIGRATION: 20260418150000_OPTIMIZE_AHSP_CATALOG
-- GOAL: High-performance RPC (Unified PUPR + Custom) with Ambiguity Fix
-- =============================================================================

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
  -- CTE 1: OFFICIAL AHSP (PUPR) CALCULATION
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
      mad.kode_item_dasar as ahsp_kode
    FROM public.master_ahsp ma
    LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
    WHERE (p_query = '' OR ma.nama_pekerjaan ILIKE '%' || p_query || '%' OR ma.kode_ahsp ILIKE '%' || p_query || '%')
      AND (p_jenis_filter = '' OR ma.jenis_pekerjaan ILIKE '%' || p_jenis_filter || '%')
  ),
  official_resolved AS (
    SELECT
      ob.*,
      COALESCE(uapo.harga_langsung, mhc_glob.harga_satuan, mhd_mk.harga_satuan, mhd_auto.harga_satuan, 0::numeric) as harga_toko,
      COALESCE(uapo.tkdn_langsung, mhc_glob.tkdn_percent, mhd_mk.tkdn_percent, mhd_auto.tkdn_percent, 0::numeric) as tkdn_val,
      COALESCE(mhc_glob.kode_item, mhd_mk.kode_item, mhd_auto.kode_item, '') as item_kode,
      COALESCE(NULLIF(mk.faktor_konversi, 0), 1::numeric) as f_konv
    FROM official_base ob
    -- User Overrides
    LEFT JOIN public.user_ahsp_price_override uapo ON uapo.ahsp_detail_id = ob.detail_id AND uapo.user_id = v_user_id
    -- Mapping
    LEFT JOIN public.master_konversi mk ON mk.uraian_ahsp = ob.detail_uraian AND (mk.satuan_ahsp IS NOT DISTINCT FROM ob.detail_satuan)
    LEFT JOIN public.master_harga_dasar mhd_mk ON mhd_mk.id = mk.item_dasar_id AND mhd_mk.location_id = p_location_id
    -- Auto-match
    LEFT JOIN public.master_harga_dasar mhd_auto ON mhd_auto.kode_item = ob.ahsp_kode AND mk.item_dasar_id IS NULL AND mhd_auto.location_id = p_location_id
    -- Global Overrides
    LEFT JOIN public.master_harga_custom mhc_glob ON mhc_glob.overrides_harga_dasar_id = COALESCE(mhd_mk.id, mhd_auto.id) AND mhc_glob.user_id = v_user_id
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
      SUM(CASE WHEN upper(left(r.item_kode,1)) = 'L' THEN (r.harga_toko/r.f_konv)*r.koefisien ELSE 0 END) as upah,
      SUM(CASE WHEN upper(left(r.item_kode,1)) IN ('A','B') THEN (r.harga_toko/r.f_konv)*r.koefisien ELSE 0 END) as bahan,
      SUM(CASE WHEN upper(left(r.item_kode,1)) = 'M' THEN (r.harga_toko/r.f_konv)*r.koefisien ELSE 0 END) as alat,
      SUM((r.harga_toko/r.f_konv)*r.koefisien) as subtotal,
      SUM((r.harga_toko/r.f_konv)*r.koefisien * (r.tkdn_val/100.0)) as tkdn_sum,
      jsonb_agg(jsonb_build_object(
        'uraian', r.detail_uraian, 'detail_id', r.detail_id, 'kode_item', r.item_kode,
        'satuan', r.detail_satuan, 'koefisien', r.koefisien, 'harga_konversi', (r.harga_toko/r.f_konv),
        'subtotal', (r.harga_toko/r.f_konv)*r.koefisien, 'tkdn', r.tkdn_val
      )) FILTER (WHERE r.detail_uraian IS NOT NULL) as details_json,
      BOOL_AND((r.harga_toko/r.f_konv)*r.koefisien > 0) as complete
    FROM official_resolved r
    GROUP BY r.m_id, r.kode_ahsp
  ),
  -- CTE 2: CUSTOM AHSP
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
        'subtotal', c.harga_satuan*c.koefisien, 'tkdn', c.tkdn_percent
      )) as details_json
    FROM custom_data c
    GROUP BY c.m_id, c.user_id, c.kode_ahsp
  ),
  union_all AS (
     -- Custom first for priority
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
