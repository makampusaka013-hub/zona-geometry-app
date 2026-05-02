-- =============================================================================
-- FINAL SIMPLIFIED Migration: Personalized AHSP Catalog
-- =============================================================================

DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap WITH (security_invoker = true) AS
WITH detail_final AS (
  SELECT 
    ma.id AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit,
    mad.uraian_ahsp,
    mad.satuan_uraian,
    mad.koefisien,
    mad.kode_item_dasar,
    -- Ambil Harga (Priority: Custom User -> Master)
    COALESCE(mhc.harga_satuan, mhd.harga_satuan, 0) as harga_item,
    COALESCE(mhd.kode_item, mad.kode_item_dasar) as final_kode,
    COALESCE(mhd.tkdn_percent, 0) as tkdn_item
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.master_harga_dasar mhd ON (mhd.kode_item = mad.kode_item_dasar OR mhd.nama_item = mad.uraian_ahsp)
  LEFT JOIN public.master_harga_custom mhc ON (mhc.overrides_harga_dasar_id = mhd.id OR mhc.kode_item = mhd.kode_item) AND mhc.user_id = auth.uid()
)
SELECT
  master_ahsp_id,
  kode_ahsp,
  MAX(nama_pekerjaan) AS nama_pekerjaan,
  MAX(divisi) AS divisi,
  MAX(jenis_pekerjaan) AS jenis_pekerjaan,
  MAX(kategori_pekerjaan) AS kategori_pekerjaan,
  MAX(satuan_pekerjaan) AS satuan_pekerjaan,
  MAX(overhead_profit) AS overhead_profit,
  SUM(CASE WHEN final_kode ILIKE 'L%' OR final_kode ILIKE 'T%' THEN (harga_item * koefisien) ELSE 0::numeric END) AS total_upah,
  SUM(CASE WHEN final_kode ILIKE 'A%' OR final_kode ILIKE 'B%' THEN (harga_item * koefisien) ELSE 0::numeric END) AS total_bahan,
  SUM(CASE WHEN final_kode ILIKE 'M%' THEN (harga_item * koefisien) ELSE 0::numeric END) AS total_alat,
  SUM(harga_item * koefisien) AS total_subtotal,
  
  -- Tambahkan Total Harga termasuk Profit bawaan AHSP
  SUM(harga_item * koefisien) * (1 + (COALESCE(MAX(ma.overhead_profit), 15) / 100)) AS total_harga_satuan,

  CASE WHEN MIN(harga_item) > 0 THEN true ELSE false END AS is_lengkap,

  CASE WHEN SUM(harga_item * koefisien) > 0 
       THEN (SUM(harga_item * koefisien * (tkdn_item/100.0)) / SUM(harga_item * koefisien)) * 100 
       ELSE 0 END AS total_tkdn_percent,

  jsonb_agg(
    jsonb_build_object(
      'uraian', uraian_ahsp,
      'kode_item', final_kode,
      'satuan', satuan_uraian,
      'koefisien', koefisien,
      'harga_konversi', harga_item,
      'subtotal', (harga_item * koefisien),
      'tkdn', tkdn_item
    )
  ) FILTER (WHERE uraian_ahsp IS NOT NULL) AS details
  
FROM detail_final
GROUP BY master_ahsp_id, kode_ahsp;

-- Restore standard view
CREATE OR REPLACE VIEW public.view_analisa_ahsp WITH (security_invoker = true) AS
SELECT
  master_ahsp_id AS id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  divisi,
  jenis_pekerjaan,
  kategori_pekerjaan,
  overhead_profit,
  total_subtotal,
  total_upah,
  total_bahan,
  total_alat,
  total_tkdn_percent,
  is_lengkap
FROM public.view_katalog_ahsp_lengkap;

GRANT SELECT ON public.view_katalog_ahsp_lengkap TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;

NOTIFY pgrst, 'reload schema';
