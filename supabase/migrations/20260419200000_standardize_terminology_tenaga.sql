-- =============================================================================
-- Migration: Standardize Terminology to 'tenaga' (from 'upah')
-- Also updates Project Resource Aggregation and Views
-- =============================================================================

-- 1. Update view_katalog_ahsp_lengkap
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

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
    
    CASE 
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' THEN 100::numeric 
      ELSE COALESCE(mhd.tkdn_percent, 0)
    END AS detail_tkdn,
    
    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,
    
    (COALESCE(mhd.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0) AS subtotal,
    
    ((COALESCE(mhd.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)) * COALESCE(mad.koefisien, 0)) * 
    (CASE WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' THEN 100::numeric ELSE COALESCE(mhd.tkdn_percent, 0) END / 100.0) AS nilai_tkdn,

    CASE
      WHEN upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' THEN 'tenaga'
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
  SUM(CASE WHEN jenis_komponen = 'tenaga' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_upah, -- Keep alias for backward-compatibility if needed, but we'll update frontend
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

  -- FIXED: Using jsonb_agg and jsonb_build_object to match jsonb_to_recordset
  jsonb_agg(
    jsonb_build_object(
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

-- Restoration of view_analisa_ahsp
CREATE OR REPLACE VIEW public.view_analisa_ahsp AS
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

-- 2. Update view_project_resource_summary
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;

CREATE OR REPLACE VIEW public.view_project_resource_summary WITH (security_invoker = true) AS
SELECT
  al.project_id,
  al.bab_pekerjaan,
  
  detail.uraian,
  COALESCE(detail.kode_item, detail.uraian) AS key_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi AS harga_snapshot,
  detail.tkdn AS tkdn_percent,

  SUM(al.volume * detail.koefisien)                          AS total_volume_terpakai,
  SUM(al.volume * detail.subtotal)                           AS kontribusi_nilai,
  SUM(al.volume * detail.subtotal * (detail.tkdn / 100.0))   AS nilai_tkdn

FROM public.ahsp_lines al
JOIN public.view_katalog_ahsp_lengkap vk ON vk.master_ahsp_id = al.master_ahsp_id
CROSS JOIN LATERAL jsonb_to_recordset(vk.details) AS detail(
  uraian        TEXT,
  kode_item     TEXT,
  satuan        TEXT,
  koefisien     NUMERIC,
  harga_konversi NUMERIC,
  jenis_komponen TEXT,
  subtotal      NUMERIC,
  tkdn          NUMERIC
)
WHERE al.master_ahsp_id IS NOT NULL
  AND detail.uraian IS NOT NULL
GROUP BY
  al.project_id,
  al.bab_pekerjaan,
  detail.uraian,
  detail.kode_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi,
  detail.tkdn;

GRANT SELECT ON public.view_project_resource_summary TO authenticated;

-- 3. Update get_project_resource_aggregation RPC
DROP FUNCTION IF EXISTS public.get_project_resource_aggregation(uuid);

CREATE OR REPLACE FUNCTION public.get_project_resource_aggregation(p_project_id uuid)
RETURNS TABLE(
  uraian text,
  key_item text,
  satuan text,
  jenis_komponen text,
  total_volume_terpakai numeric,
  kontribusi_nilai numeric,
  nilai_tkdn numeric
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    uraian,
    key_item,
    satuan,
    jenis_komponen,
    SUM(total_volume_terpakai) as total_volume_terpakai,
    SUM(kontribusi_nilai) as kontribusi_nilai,
    SUM(nilai_tkdn) as nilai_tkdn
  FROM public.view_project_resource_summary
  WHERE project_id = p_project_id
  GROUP BY uraian, key_item, satuan, jenis_komponen
  ORDER BY jenis_komponen, uraian;
$$;

NOTIFY pgrst, 'reload schema';
