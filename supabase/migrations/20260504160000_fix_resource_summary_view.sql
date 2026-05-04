-- =============================================================================
-- Migration: Fix view_project_resource_summary - add total_volume_terpakai
-- Also fixes get_project_resource_aggregation RPC return columns
-- Date: 2026-05-04
-- =============================================================================

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
    mad.kode_item_dasar
  FROM public.ahsp_lines al
  JOIN public.projects p ON p.id = al.project_id
  JOIN public.master_ahsp ma ON ma.id = al.master_ahsp_id
  JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  WHERE al.deleted_at IS NULL
    AND al.master_ahsp_id IS NOT NULL
),
resolved AS (
  SELECT
    b.*,
    mhd.id        AS item_id,
    mhd.kode_item,
    mhd.harga_satuan,
    COALESCE(mhd.tkdn_percent, 0) AS tkdn_pct
  FROM base b
  LEFT JOIN public.master_konversi mk
    ON mk.uraian_ahsp = b.uraian_ahsp
   AND (mk.satuan_ahsp IS NOT DISTINCT FROM b.satuan_uraian)
  LEFT JOIN public.master_harga_dasar mhd
    ON mhd.id = mk.item_dasar_id
   AND mhd.location_id = b.loc_id
)
SELECT
  project_id,
  bab_pekerjaan,
  uraian_ahsp                             AS uraian,
  COALESCE(kode_item, uraian_ahsp)        AS key_item,
  satuan_uraian                           AS satuan,
  CASE
    WHEN upper(left(trim(COALESCE(kode_item, uraian_ahsp)), 1)) = 'L' THEN 'tenaga'
    WHEN upper(left(trim(COALESCE(kode_item, uraian_ahsp)), 1)) IN ('A','B') THEN 'bahan'
    WHEN upper(left(trim(COALESCE(kode_item, uraian_ahsp)), 1)) = 'M' THEN 'alat'
    ELSE 'bahan'
  END                                     AS jenis_komponen,
  harga_satuan                            AS harga_snapshot,
  tkdn_pct                                AS tkdn_percent,
  item_id,
  SUM(volume * koefisien)                                              AS total_volume_terpakai,
  SUM(volume * koefisien * COALESCE(harga_satuan, 0))                  AS kontribusi_nilai,
  SUM(volume * koefisien * COALESCE(harga_satuan, 0) * (tkdn_pct/100.0)) AS nilai_tkdn
FROM resolved
WHERE uraian_ahsp IS NOT NULL
GROUP BY
  project_id, bab_pekerjaan, uraian_ahsp,
  kode_item, satuan_uraian, harga_satuan,
  tkdn_pct, item_id;

GRANT SELECT ON public.view_project_resource_summary TO authenticated;


-- Fix fungsi RPC agar return total_volume_terpakai
DROP FUNCTION IF EXISTS public.get_project_resource_aggregation(uuid);

CREATE OR REPLACE FUNCTION public.get_project_resource_aggregation(p_project_id uuid)
RETURNS TABLE(
  uraian                text,
  key_item              text,
  satuan                text,
  jenis_komponen        text,
  total_volume_terpakai numeric,
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
    SUM(total_volume_terpakai) AS total_volume_terpakai,
    SUM(kontribusi_nilai)      AS kontribusi_nilai,
    SUM(nilai_tkdn)            AS nilai_tkdn
  FROM public.view_project_resource_summary
  WHERE project_id = p_project_id
  GROUP BY uraian, key_item, satuan, jenis_komponen
  ORDER BY jenis_komponen, uraian;
$$;

NOTIFY pgrst, 'reload schema';
