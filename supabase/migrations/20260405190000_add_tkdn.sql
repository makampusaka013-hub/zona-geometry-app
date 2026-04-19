-- Menambahkan atribut TKDN
ALTER TABLE public.master_harga_dasar ADD COLUMN IF NOT EXISTS tkdn_percent numeric DEFAULT 0;

-- Menghapus view jika eksis agar aman
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

-- Membuat View Komprehensif untuk Katalog
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap AS
WITH detail_calc AS (
  SELECT
    ma.id AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit,
    mad.uraian_ahsp AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,
    mhd.kode_item AS detail_kode_item,
    COALESCE(mhd.harga_satuan, 0) AS harga_toko,
    COALESCE(mhd.tkdn_percent, 0) AS detail_tkdn,
    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,
    
    (COALESCE(mhd.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0) AS subtotal,
    -- Nilai absolut TKDN = subtotal * (TKDN% / 100)
    ((COALESCE(mhd.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0)) * (COALESCE(mhd.tkdn_percent, 0) / 100.0) AS nilai_tkdn,

    CASE
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.master_konversi mk ON mk.uraian_ahsp = mad.uraian_ahsp AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)
  LEFT JOIN public.master_harga_dasar mhd ON mhd.id = mk.item_dasar_id
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
  SUM(CASE WHEN jenis_komponen = 'upah' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_upah,
  SUM(CASE WHEN jenis_komponen = 'bahan' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_bahan,
  SUM(CASE WHEN jenis_komponen = 'alat' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_alat,
  SUM(COALESCE(subtotal, 0)) AS total_subtotal,
  
  CASE WHEN SUM(COALESCE(subtotal, 0)) > 0 
       THEN (SUM(COALESCE(nilai_tkdn, 0)) / SUM(COALESCE(subtotal, 0))) * 100 
       ELSE 0 
  END AS total_tkdn_percent,

  json_agg(
    json_build_object(
      'uraian', detail_uraian,
      'kode_item', detail_kode_item,
      'satuan', detail_satuan,
      'koefisien', koefisien,
      'harga_konversi', (harga_toko / faktor_efektif),
      'jenis_komponen', jenis_komponen,
      'subtotal', subtotal,
      'tkdn', detail_tkdn
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
  
FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;

NOTIFY pgrst, 'reload schema';
