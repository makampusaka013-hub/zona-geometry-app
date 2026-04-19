-- =============================================================================
-- SECURITY HARDENING: REFRESHING RESOURCE AGGREGATION VIEWS
-- Ensures views respect RLS (security_invoker) and master data is consistent
-- =============================================================================

-- 1. master_ahsp_details (Consistency with master_ahsp)
-- -----------------------------------------------------------------------------
ALTER TABLE public.master_ahsp_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_master_ahsp_details ON public.master_ahsp_details;
CREATE POLICY select_master_ahsp_details ON public.master_ahsp_details 
FOR SELECT TO authenticated 
USING (true);

DROP POLICY IF EXISTS admin_all_master_ahsp_details ON public.master_ahsp_details;
CREATE POLICY admin_all_master_ahsp_details ON public.master_ahsp_details 
FOR ALL TO authenticated 
USING (public.is_app_admin());


-- 2. view_katalog_ahsp_lengkap (Harden with security_invoker)
-- -----------------------------------------------------------------------------
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
  
  -- Jika item minimum bernilai 0, maka ada setidaknya 1 material/upah kosong
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
      'subtotal', subtotal,
      'tkdn', detail_tkdn
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
  
FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;


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
  is_lengkap,
  1 as urutan_prioritas
FROM public.view_katalog_ahsp_lengkap;


-- 3. view_project_resource_summary (Refresh with security_invoker)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;

CREATE OR REPLACE VIEW public.view_project_resource_summary WITH (security_invoker = true) AS
SELECT
  al.project_id,
  al.bab_pekerjaan,
  
  -- Identitas komponen dari detail katalog
  detail.uraian,
  COALESCE(detail.kode_item, detail.uraian) AS key_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi AS harga_snapshot,
  detail.tkdn AS tkdn_percent,

  -- Kalkulasi nilai berdasarkan volume RAB x subtotal komponen
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

-- Grant permissions again
GRANT SELECT ON public.view_project_resource_summary TO authenticated;
GRANT SELECT ON public.view_katalog_ahsp_lengkap TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;


-- 4. RPC Hardening (search_path)
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.get_effective_project_budget(uuid) SET search_path = public;

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
