-- Migration: Update views and RPCs to use dynamic global profit fallback
-- Instead of hardcoded 15%, we use get_global_profit()

CREATE OR REPLACE FUNCTION get_ahsp_catalog_v2(
  p_location_id uuid,
  p_query text default '',
  p_jenis_filter text default '',
  p_show_incomplete boolean default false,
  p_limit int default 10,
  p_offset int default 0
) 
RETURNS TABLE (
  master_ahsp_id uuid,
  kode_ahsp text,
  nama_pekerjaan text,
  divisi text,
  jenis_pekerjaan text,
  kategori_pekerjaan text,
  satuan_pekerjaan text,
  overhead_profit numeric,
  total_upah numeric,
  total_bahan numeric,
  total_alat numeric,
  total_subtotal numeric,
  total_tkdn_percent numeric,
  is_lengkap boolean,
  is_custom boolean,
  details jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_global_profit numeric := get_global_profit();
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
      COALESCE(ma.overhead_profit, v_global_profit) as overhead_profit,
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
  prices AS (
     -- Logic to get prices (same as before)
     SELECT 
        id, 
        kode_item, 
        harga_satuan, 
        satuan, 
        tkdn_percent
     FROM view_master_harga_gabungan
  ),
  merged_details AS (
    -- Step 1: Official AHSP details
    SELECT 
      ob.m_id,
      ob.kode_ahsp,
      ob.nama_pekerjaan,
      ob.divisi,
      ob.jenis_pekerjaan,
      ob.kategori_pekerjaan,
      ob.satuan_pekerjaan,
      ob.overhead_profit,
      ob.koefisien,
      ob.detail_faktor,
      ob.detail_uraian as uraian,
      ob.detail_satuan as satuan,
      ob.ahsp_kode as kode_item,
      p.harga_satuan as harga_master,
      p.tkdn_percent,
      CASE 
        WHEN p.harga_satuan IS NOT NULL THEN (p.harga_satuan / ob.detail_faktor) * ob.koefisien
        ELSE 0 
      END as subtotal,
      CASE 
        WHEN p.harga_satuan IS NOT NULL THEN p.harga_satuan / ob.detail_faktor
        ELSE 0
      END as harga_konversi,
      FALSE as is_custom
    FROM official_base ob
    LEFT JOIN prices p ON p.kode_item = ob.ahsp_kode

    UNION ALL

    -- Step 2: Custom AHSP details
    SELECT 
      ac.id as m_id,
      ac.kode_ahsp,
      ac.nama_pekerjaan,
      '-' as divisi,
      ac.jenis_pekerjaan,
      ac.kategori_pekerjaan,
      ac.satuan_pekerjaan,
      ac.overhead_profit,
      adc.koefisien,
      1 as detail_faktor,
      p.nama_item as uraian,
      p.satuan,
      p.kode_item,
      p.harga_satuan as harga_master,
      p.tkdn_percent,
      (p.harga_satuan * adc.koefisien) as subtotal,
      p.harga_satuan as harga_konversi,
      TRUE as is_custom
    FROM public.master_ahsp_custom ac
    JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
    LEFT JOIN prices p ON p.id = adc.item_id
    WHERE (p_query = '' OR ac.nama_pekerjaan ILIKE '%' || p_query || '%' OR ac.kode_ahsp ILIKE '%' || p_query || '%')
      AND (p_jenis_filter = '' OR ac.jenis_pekerjaan ILIKE '%' || p_jenis_filter || '%')
      AND (ac.is_public = TRUE OR ac.created_by = v_user_id)
  ),
  aggregated AS (
    SELECT 
      m_id,
      kode_ahsp,
      nama_pekerjaan,
      divisi,
      jenis_pekerjaan,
      kategori_pekerjaan,
      satuan_pekerjaan,
      overhead_profit,
      SUM(CASE WHEN kode_item LIKE 'L%' THEN subtotal ELSE 0 END) as total_upah,
      SUM(CASE WHEN (kode_item LIKE 'A%' OR kode_item LIKE 'B%') THEN subtotal ELSE 0 END) as total_bahan,
      SUM(CASE WHEN kode_item LIKE 'M%' THEN subtotal ELSE 0 END) as total_alat,
      SUM(subtotal) as total_subtotal,
      AVG(tkdn_percent) FILTER (WHERE tkdn_percent > 0) as total_tkdn_percent,
      is_custom,
      jsonb_agg(jsonb_build_object(
        'uraian', uraian,
        'kode_item', kode_item,
        'satuan', satuan,
        'koefisien', koefisien,
        'harga_konversi', harga_konversi,
        'subtotal', subtotal,
        'tkdn', tkdn_percent
      )) as details
    FROM merged_details
    GROUP BY m_id, kode_ahsp, nama_pekerjaan, divisi, jenis_pekerjaan, kategori_pekerjaan, satuan_pekerjaan, overhead_profit, is_custom
  )
  SELECT 
    m_id,
    kode_ahsp,
    nama_pekerjaan,
    divisi,
    jenis_pekerjaan,
    kategori_pekerjaan,
    satuan_pekerjaan,
    overhead_profit,
    total_upah,
    total_bahan,
    total_alat,
    total_subtotal,
    COALESCE(total_tkdn_percent, 0),
    (total_subtotal > 0) as is_lengkap,
    is_custom,
    details
  FROM aggregated
  WHERE (p_show_incomplete = TRUE OR total_subtotal > 0)
  ORDER BY kode_ahsp
  LIMIT p_limit OFFSET p_offset;
END;
$$;
