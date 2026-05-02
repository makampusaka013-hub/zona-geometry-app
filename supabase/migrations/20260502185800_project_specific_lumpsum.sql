-- Migration: Add project_id to master_harga_custom and update unified view
-- This allows Lumpsum items to be project-specific.

-- 1. Add project_id column to master_harga_custom
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- 2. Update view_master_harga_gabungan to expose project_id
-- We need to DROP and CREATE because the column list is changing.
DROP VIEW IF EXISTS public.view_master_harga_gabungan CASCADE;

CREATE VIEW public.view_master_harga_gabungan WITH (security_invoker = true) AS
SELECT 
  id, 
  user_id,
  project_id, -- New column exposed
  kategori_item, 
  kode_item, 
  nama_item, 
  satuan, 
  harga_satuan, 
  tkdn_percent,
  overrides_harga_dasar_id,
  'Custom Anda' AS sumber, 
  'master_harga_custom' AS source_table,
  1 AS urutan_prioritas
FROM public.master_harga_custom
UNION ALL
SELECT 
  id, 
  NULL AS user_id,
  NULL AS project_id, -- Not applicable for official items
  CASE 
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) = 'L' THEN 'Upah'
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) IN ('A', 'B') THEN 'Bahan'
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) = 'M' THEN 'Alat'
    ELSE 'Lainnya'
  END AS kategori_item,
  kode_item, 
  nama_item, 
  satuan, 
  harga_satuan, 
  tkdn_percent,
  NULL::uuid AS overrides_harga_dasar_id,
  'Resmi' AS sumber, 
  'master_harga_dasar' AS source_table,
  2 AS urutan_prioritas
FROM public.master_harga_dasar;

-- 3. Update dependent views (from previous migrations)
-- Note: Rebuilding these is necessary because they depend on view_master_harga_gabungan

-- Rebuild view_katalog_ahsp_lengkap (Simplified version from latest migration)
CREATE OR REPLACE VIEW public.view_katalog_ahsp_lengkap WITH (security_invoker = true) AS
WITH detail_calc AS (
  SELECT
    ma.id AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit,
    mad.uraian_ahsp AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,
    vmg.id                          AS item_dasar_id,
    vmg.source_table,
    vmg.kode_item                   AS detail_kode_item,
    COALESCE(vmg.harga_satuan, 0)   AS harga_toko,
    COALESCE(vmg.tkdn_percent, 0)   AS detail_tkdn,
    COALESCE(mad.koefisien, 0) * (COALESCE(vmg.harga_satuan, 0)) AS subtotal,
    CASE
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.view_master_harga_gabungan vmg ON vmg.kode_item = mad.uraian_ahsp OR vmg.nama_item = mad.uraian_ahsp
)
SELECT
  master_ahsp_id,
  kode_ahsp,
  MAX(nama_pekerjaan)       AS nama_pekerjaan,
  MAX(satuan_pekerjaan)     AS satuan_pekerjaan,
  MAX(overhead_profit)      AS overhead_profit,
  SUM(COALESCE(subtotal, 0)) AS total_subtotal,
  jsonb_agg(
    jsonb_build_object(
      'uraian',         detail_uraian,
      'kode_item',      detail_kode_item,
      'satuan',         detail_satuan,
      'koefisien',      koefisien,
      'harga_konversi', harga_toko,
      'jenis_komponen', jenis_komponen,
      'subtotal',       subtotal,
      'tkdn',           detail_tkdn
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
