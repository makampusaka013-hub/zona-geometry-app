-- 1. HAPUS VIEW YANG BERGANTUNG (UNTUK RE-BUILD)
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_custom CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- 2. REBUILD view_katalog_ahsp_lengkap (LEBIH STABIL)
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap 
WITH (security_invoker = true) AS
WITH context AS (
  SELECT COALESCE(selected_location_id, (SELECT id FROM public.locations LIMIT 1)) as loc_id
  FROM public.members WHERE user_id = auth.uid()
  UNION ALL
  SELECT id FROM public.locations WHERE NOT EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid()) LIMIT 1
),
base_data AS (
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
    r.*,
    mk.faktor_konversi AS global_faktor
  FROM base_data b
  LEFT JOIN public.master_konversi mk ON 
    LOWER(TRIM(mk.uraian_ahsp)) = LOWER(TRIM(b.detail_uraian)) AND 
    LOWER(TRIM(mk.satuan_ahsp)) = LOWER(TRIM(b.detail_satuan))
),
price_resolution AS (
  SELECT
    gm.*,
    COALESCE(mhd_loc.harga_satuan, mhd_any.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd_loc.satuan, mhd_any.satuan) AS price_satuan,
    COALESCE(mhd_loc.tkdn_percent, mhd_any.tkdn_percent, 0) AS detail_tkdn,
    COALESCE(mhd_loc.kode_item, mhd_any.kode_item) AS resolved_kode_item
  FROM global_mapping gm
  LEFT JOIN public.master_harga_dasar mhd_loc ON mhd_loc.kode_item = gm.detail_kode_item AND mhd_loc.location_id = (SELECT loc_id FROM context LIMIT 1)
  LEFT JOIN (
      SELECT DISTINCT ON (kode_item) kode_item, harga_satuan, satuan, tkdn_percent 
      FROM public.master_harga_dasar 
      ORDER BY kode_item, updated_at DESC
  ) mhd_any ON mhd_any.kode_item = gm.detail_kode_item AND mhd_loc.id IS NULL
),
computed AS (
  SELECT
    *,
    COALESCE(NULLIF(global_faktor, 0), NULLIF(raw_faktor, 0), 1.0) AS detail_faktor
  FROM price_resolution
),
final_agg AS (
  SELECT
    master_ahsp_id,
    kode_ahsp,
    MAX(nama_pekerjaan) AS nama_pekerjaan,
    MAX(divisi) AS divisi,
    MAX(jenis_pekerjaan) AS jenis_pekerjaan,
    MAX(kategori_pekerjaan) AS kategori_pekerjaan,
    MAX(satuan_pekerjaan) AS satuan_pekerjaan,
    MAX(overhead_profit) AS overhead_profit,
    SUM(CASE WHEN upper(left(trim(resolved_kode_item),1)) = 'L' THEN (koefisien * (harga_toko / detail_faktor)) ELSE 0 END) AS total_upah,
    SUM(CASE WHEN upper(left(trim(resolved_kode_item),1)) IN ('A','B') THEN (koefisien * (harga_toko / detail_faktor)) ELSE 0 END) AS total_bahan,
    SUM(CASE WHEN upper(left(trim(resolved_kode_item),1)) = 'M' THEN (koefisien * (harga_toko / detail_faktor)) ELSE 0 END) AS total_alat,
    SUM(koefisien * (harga_toko / detail_faktor)) AS total_subtotal,
    jsonb_agg(
      jsonb_build_object(
        'uraian', detail_uraian,
        'kode_item', resolved_kode_item,
        'satuan', detail_satuan,
        'koefisien', koefisien,
        'harga_konversi', (harga_toko / detail_faktor),
        'subtotal', (koefisien * (harga_toko / detail_faktor)),
        'tkdn', detail_tkdn
      )
    ) AS details
  FROM computed
  GROUP BY master_ahsp_id, kode_ahsp
)
SELECT *, true AS is_lengkap, 0 AS total_tkdn_percent FROM final_agg;

-- 3. REBUILD view_katalog_ahsp_custom (FIXED global_faktor)
CREATE OR REPLACE VIEW public.view_katalog_ahsp_custom 
WITH (security_invoker = true) AS
SELECT
    ac.id AS master_ahsp_id,
    ac.user_id,
    ac.kode_ahsp,
    ac.nama_pekerjaan,
    ac.satuan_pekerjaan,
    ac.kategori_pekerjaan,
    ac.jenis_pekerjaan,
    ac.overhead_profit,
    0 AS total_upah,
    0 AS total_bahan,
    0 AS total_alat,
    0 AS total_subtotal,
    0 AS total_tkdn_percent,
    true AS is_custom,
    1 AS urutan_prioritas,
    true AS is_lengkap,
    '[]'::jsonb AS details
FROM public.master_ahsp_custom ac;

-- 4. GABUNGKAN KEMBALI
CREATE OR REPLACE VIEW public.view_katalog_ahsp_gabungan WITH (security_invoker = true) AS
SELECT * FROM public.view_katalog_ahsp_custom
UNION ALL
SELECT
  master_ahsp_id, NULL AS user_id, kode_ahsp, nama_pekerjaan, satuan_pekerjaan, kategori_pekerjaan, jenis_pekerjaan, overhead_profit,
  total_upah, total_bahan, total_alat, total_subtotal, total_tkdn_percent, false AS is_custom, 2 AS urutan_prioritas, is_lengkap, details
FROM public.view_katalog_ahsp_lengkap;

GRANT SELECT ON public.view_katalog_ahsp_lengkap TO authenticated, anon, service_role;
GRANT SELECT ON public.view_katalog_ahsp_custom TO authenticated, anon, service_role;
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated, anon, service_role;
