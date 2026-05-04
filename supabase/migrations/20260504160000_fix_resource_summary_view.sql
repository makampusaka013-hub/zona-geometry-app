-- Migration: Fix Resource Summary View with Grouping and Column Sync
-- Date: 2026-05-04

DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;

CREATE OR REPLACE VIEW public.view_project_resource_summary 
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    al.project_id,
    p.location_id AS loc_id,
    al.volume,
    al.bab_pekerjaan,
    mad.uraian_ahsp,
    mad.satuan_uraian,
    mad.koefisien,
    mad.kode_item_dasar,
    COALESCE(NULLIF(mad.faktor_konversi, 0), 1) AS faktor_konversi
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.master_ahsp ma ON ma.id = al.master_ahsp_id
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  WHERE al.deleted_at IS NULL
    AND al.master_ahsp_id IS NOT NULL
    AND mad.kode_item_dasar IS NOT NULL
),
resolved AS (
  SELECT
    b.*,
    COALESCE(mhd_loc.kode_item, mhd_any.kode_item, b.kode_item_dasar) AS kode_item,
    COALESCE(
      mhd_loc.harga_satuan / b.faktor_konversi,
      mhd_any.harga_satuan / b.faktor_konversi,
      0
    ) AS harga_efektif,
    COALESCE(
      mhd_loc.tkdn_percent,
      mhd_any.tkdn_percent,
      CASE WHEN upper(left(trim(b.kode_item_dasar), 1)) = 'L' THEN 100 ELSE 0 END
    ) AS tkdn_pct
  FROM base b
  LEFT JOIN public.master_harga_dasar mhd_loc
    ON mhd_loc.kode_item = b.kode_item_dasar
   AND mhd_loc.location_id = b.loc_id
  LEFT JOIN public.master_harga_dasar mhd_any
    ON mhd_any.kode_item = b.kode_item_dasar
   AND mhd_loc.id IS NULL
),
aggregated AS (
  SELECT
    project_id,
    bab_pekerjaan,
    uraian_ahsp,
    satuan_uraian,
    CASE
      WHEN upper(left(trim(kode_item_dasar), 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(left(trim(kode_item_dasar), 1)) = 'L' THEN 'tenaga'
      WHEN upper(left(trim(kode_item_dasar), 1)) = 'M' THEN 'alat'
      ELSE 'bahan'
    END AS jenis_komponen,
    MIN(kode_item) AS key_item,
    MAX(harga_efektif) AS harga_snapshot,
    MAX(tkdn_pct) AS tkdn_percent,
    SUM(volume * koefisien)                                                  AS total_volume,
    SUM(volume * koefisien * harga_efektif)                                  AS kontribusi_nilai,
    SUM(volume * koefisien * harga_efektif * (tkdn_pct / 100.0))             AS nilai_tkdn
  FROM resolved
  WHERE uraian_ahsp IS NOT NULL
  GROUP BY
    project_id, bab_pekerjaan, uraian_ahsp, satuan_uraian, jenis_komponen
)
SELECT
  project_id,
  bab_pekerjaan,
  uraian_ahsp    AS uraian,
  key_item,
  satuan_uraian  AS satuan,
  jenis_komponen,
  harga_snapshot,
  tkdn_percent,
  tkdn_percent   AS tkdn,
  total_volume,
  kontribusi_nilai,
  nilai_tkdn
FROM aggregated;

GRANT SELECT ON public.view_project_resource_summary TO authenticated;

-- Fix RPC: return total_volume
DROP FUNCTION IF EXISTS public.get_project_resource_aggregation(uuid);

CREATE OR REPLACE FUNCTION public.get_project_resource_aggregation(p_project_id uuid)
RETURNS TABLE(
  uraian                text,
  key_item              text,
  satuan                text,
  jenis_komponen        text,
  total_volume          numeric,
  kontribusi_nilai      numeric,
  nilai_tkdn            numeric
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
    SUM(total_volume) AS total_volume,
    SUM(kontribusi_nilai)      AS kontribusi_nilai,
    SUM(nilai_tkdn)            AS nilai_tkdn
  FROM public.view_project_resource_summary
  WHERE project_id = p_project_id
  GROUP BY
    uraian,
    key_item,
    satuan,
    jenis_komponen
  ORDER BY 
    jenis_komponen, 
    uraian;
$$;

NOTIFY pgrst, 'reload schema';
