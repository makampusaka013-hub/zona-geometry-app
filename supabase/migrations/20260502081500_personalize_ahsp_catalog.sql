-- =============================================================================
-- REPAIR Migration: Personalize AHSP Catalog (FIX MISSING ITEMS)
-- =============================================================================

DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap WITH (security_invoker = true) AS
WITH detail_calc AS (
  SELECT
    ma.id AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit_master,
    mad.uraian_ahsp AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,
    COALESCE(mhd.kode_item, mad.uraian_ahsp) AS detail_kode_item,
    
    -- HARGA DINAMIS
    COALESCE(mhc.harga_satuan, mhd.harga_satuan, 0) AS harga_toko,
    
    CASE 
      WHEN upper(substring(trim(coalesce(mhd.kode_item, mad.uraian_ahsp)), 1, 1)) = 'L' THEN 100::numeric 
      ELSE COALESCE(mhd.tkdn_percent, 0)
    END AS detail_tkdn,
    
    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,
    
    -- Kalkulasi Subtotal Dasar per Item (HPP)
    (COALESCE(COALESCE(mhc.harga_satuan, mhd.harga_satuan), 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0) AS subtotal,
    
    -- Nilai TKDN
    ((COALESCE(COALESCE(mhc.harga_satuan, mhd.harga_satuan), 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0)) * 
    (CASE WHEN upper(substring(trim(coalesce(mhd.kode_item, mad.uraian_ahsp)), 1, 1)) = 'L' THEN 100::numeric ELSE COALESCE(mhd.tkdn_percent, 0) END / 100.0) AS nilai_tkdn,

    -- Deteksi Jenis Komponen yang lebih kuat
    CASE
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' OR lower(mad.uraian_ahsp) ~ '^(pekerja|tukang|mandor|kepala tukang)' THEN 'tenaga'
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) IN ('A', 'B') OR lower(mad.satuan_uraian) IN ('kg', 'm3', 'm2', 'm1', 'btg', 'bh', 'zak', 'ltr') THEN 'bahan'
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'M' OR lower(mad.uraian_ahsp) ~ '(alat|excavator|vibro|loader|truck)' THEN 'alat'
      ELSE 'bahan' -- Fallback ke bahan jika ragu, agar tetap muncul di list material
    END AS jenis_komponen
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  -- JOIN 1: Lewat Tabel Konversi (Resmi)
  LEFT JOIN public.master_konversi mk ON trim(mk.uraian_ahsp) = trim(mad.uraian_ahsp) AND (trim(mk.satuan_ahsp) IS NOT DISTINCT FROM trim(mad.satuan_uraian))
  
  -- JOIN 2: Harga Dasar (Bisa lewat Konversi atau langsung lewat Nama/Kode sebagai Fallback)
  LEFT JOIN public.master_harga_dasar mhd ON (
    mhd.id = mk.item_dasar_id OR 
    trim(mhd.nama_item) = trim(mad.uraian_ahsp) OR 
    trim(mhd.kode_item) = trim(mad.uraian_ahsp)
  )
  
  -- JOIN 3: Harga Custom (Override)
  LEFT JOIN public.master_harga_custom mhc ON (
    mhc.overrides_harga_dasar_id = mhd.id OR 
    trim(mhc.kode_item) = trim(mhd.kode_item) OR
    trim(mhc.nama_item) = trim(mad.uraian_ahsp)
  ) AND mhc.user_id = auth.uid()
)
SELECT
  master_ahsp_id,
  kode_ahsp,
  MAX(nama_pekerjaan) AS nama_pekerjaan,
  MAX(divisi) AS divisi,
  MAX(jenis_pekerjaan) AS jenis_pekerjaan,
  MAX(kategori_pekerjaan) AS kategori_pekerjaan,
  MAX(satuan_pekerjaan) AS satuan_pekerjaan,
  MAX(overhead_profit_master) AS overhead_profit_master,
  SUM(CASE WHEN jenis_komponen = 'tenaga' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_upah,
  SUM(CASE WHEN jenis_komponen = 'bahan' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_bahan,
  SUM(CASE WHEN jenis_komponen = 'alat' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_alat,
  SUM(COALESCE(subtotal, 0)) AS total_subtotal,
  
  MIN(COALESCE(subtotal, 0)) AS min_subtotal_item,
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
      'uraian', detail_uraian,
      'kode_item', detail_kode_item,
      'satuan', detail_satuan,
      'koefisien', koefisien,
      'harga_konversi', (harga_toko / faktor_efektif),
      'jenis_komponen', jenis_komponen,
      'subtotal', subtotal
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
  
FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;

-- Rebuild view_analisa_ahsp
CREATE OR REPLACE VIEW public.view_analisa_ahsp WITH (security_invoker = true) AS
SELECT
  master_ahsp_id AS id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  divisi,
  jenis_pekerjaan,
  kategori_pekerjaan,
  overhead_profit_master as overhead_profit,
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
