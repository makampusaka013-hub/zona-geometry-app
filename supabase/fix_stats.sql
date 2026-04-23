-- 1. Fix view_katalog_ahsp_custom logic for is_lengkap
CREATE OR REPLACE VIEW public.view_katalog_ahsp_custom WITH (security_invoker = true) AS
WITH detail_prep AS (
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
    adc.id AS detail_id,
    adc.koefisien,
    vmg.harga_satuan,
    vmg.tkdn_percent,
    (vmg.harga_satuan * adc.koefisien) AS subtotal,
    (vmg.harga_satuan * adc.koefisien * (vmg.tkdn_percent / 100.0)) AS nilai_tkdn
  FROM public.master_ahsp_custom ac
  JOIN public.master_ahsp_details_custom adc ON adc.ahsp_id = ac.id
  JOIN public.view_master_harga_gabungan vmg 
    ON vmg.id = adc.item_id 
   AND vmg.source_table = adc.source_table
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
  -- Dinamis: Jika ada komponen harganya 0, maka tidak lengkap
  CASE 
    WHEN MIN(subtotal) > 0 AND SUM(subtotal) > 0 THEN true 
    ELSE false 
  END AS is_lengkap,
  jsonb_agg(
    jsonb_build_object(
      'uraian', detail_uraian,
      'detail_id', detail_id,
      'kode_item', detail_kode_item,
      'satuan', detail_satuan,
      'koefisien', koefisien,
      'harga_konversi', harga_satuan,
      'jenis_komponen', lower(kategori_item),
      'subtotal', subtotal,
      'tkdn', tkdn_percent
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
FROM detail_prep
GROUP BY master_ahsp_id, user_id, kode_ahsp;

-- 2. Add RPC for efficient stats fetching
CREATE OR REPLACE FUNCTION public.get_ahsp_catalog_stats()
RETURNS TABLE(complete_count bigint, incomplete_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE is_lengkap = true),
    COUNT(*) FILTER (WHERE is_lengkap = false)
  FROM public.view_katalog_ahsp_gabungan;
$$;

GRANT EXECUTE ON FUNCTION public.get_ahsp_catalog_stats() TO authenticated;
