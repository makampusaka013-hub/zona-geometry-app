-- =============================================================================
-- FIX VIEW AHSP & RESOURCE SUMMARY: EXPOSE IDs FOR OVERRIDE
-- Menambahkan kemudahan bagi frontend untuk melakukan override harga
-- PERBAIKAN: view_master_harga_gabungan direkonstruksi terlebih dahulu
--            untuk menyertakan kolom overrides_harga_dasar_id
-- =============================================================================

-- Hapus semua view dependen dari bawah ke atas
DROP VIEW IF EXISTS public.view_project_resource_summary CASCADE;
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;
DROP VIEW IF EXISTS public.view_master_harga_gabungan CASCADE;

-- ─── STEP 0: Rebuild view_master_harga_gabungan ───────────────────────────
-- Tambah kolom overrides_harga_dasar_id (NULL untuk item PUPR resmi)
CREATE VIEW public.view_master_harga_gabungan WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  kategori_item,
  kode_item,
  nama_item,
  satuan,
  harga_satuan,
  tkdn_percent,
  overrides_harga_dasar_id,
  'Custom Anda'         AS sumber,
  'master_harga_custom' AS source_table,
  1                     AS urutan_prioritas
FROM public.master_harga_custom
UNION ALL
SELECT
  id,
  NULL::uuid            AS user_id,
  CASE
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) = 'L' THEN 'Upah'
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) IN ('A', 'B') THEN 'Bahan'
    WHEN upper(substring(trim(coalesce(kode_item, '')), 1, 1)) = 'M' THEN 'Alat'
    ELSE 'Lainnya'
  END                   AS kategori_item,
  kode_item,
  nama_item,
  satuan,
  harga_satuan,
  tkdn_percent,
  NULL::uuid            AS overrides_harga_dasar_id,
  'Resmi'               AS sumber,
  'master_harga_dasar'  AS source_table,
  2                     AS urutan_prioritas
FROM public.master_harga_dasar;

GRANT SELECT ON public.view_master_harga_gabungan TO authenticated;

-- ─── STEP 1: Rebuild view_katalog_ahsp_lengkap ────────────────────────────
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
    vmg.id                          AS item_dasar_id,
    vmg.source_table,
    vmg.overrides_harga_dasar_id,
    vmg.kode_item                   AS detail_kode_item,
    COALESCE(vmg.harga_satuan, 0)   AS harga_toko,
    COALESCE(vmg.tkdn_percent, 0)   AS detail_tkdn,
    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,
    (COALESCE(vmg.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric))
      * COALESCE(mad.koefisien, 0) AS subtotal,
    ((COALESCE(vmg.harga_satuan, 0) / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric))
      * COALESCE(mad.koefisien, 0))
      * (COALESCE(vmg.tkdn_percent, 0) / 100.0) AS nilai_tkdn,
    CASE
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(substring(trim(coalesce(vmg.kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp = mad.uraian_ahsp
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)
  LEFT JOIN public.view_master_harga_gabungan vmg ON vmg.id = mk.item_dasar_id
)
SELECT
  master_ahsp_id,
  kode_ahsp,
  MAX(nama_pekerjaan)       AS nama_pekerjaan,
  MAX(divisi)               AS divisi,
  MAX(jenis_pekerjaan)      AS jenis_pekerjaan,
  MAX(kategori_pekerjaan)   AS kategori_pekerjaan,
  MAX(satuan_pekerjaan)     AS satuan_pekerjaan,
  MAX(overhead_profit)      AS overhead_profit,
  SUM(CASE WHEN jenis_komponen = 'upah'  THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_upah,
  SUM(CASE WHEN jenis_komponen = 'bahan' THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_bahan,
  SUM(CASE WHEN jenis_komponen = 'alat'  THEN COALESCE(subtotal, 0) ELSE 0::numeric END) AS total_alat,
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
      'uraian',         detail_uraian,
      'kode_item',      detail_kode_item,
      'satuan',         detail_satuan,
      'koefisien',      koefisien,
      'harga_konversi', (harga_toko / faktor_efektif),
      'jenis_komponen', jenis_komponen,
      'subtotal',       subtotal,
      'tkdn',           detail_tkdn,
      'item_dasar_id',  item_dasar_id,
      'source_table',   source_table,
      'overrides_id',   overrides_harga_dasar_id
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details
FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;

-- ─── STEP 2: Rebuild view_analisa_ahsp ────────────────────────────────────
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

-- ─── STEP 3: Rebuild view_project_resource_summary ────────────────────────
CREATE OR REPLACE VIEW public.view_project_resource_summary WITH (security_invoker = true) AS
SELECT
  al.project_id,
  al.bab_pekerjaan,
  detail.uraian,
  COALESCE(detail.kode_item, detail.uraian) AS key_item,
  detail.satuan,
  detail.jenis_komponen,
  detail.harga_konversi   AS harga_snapshot,
  detail.tkdn             AS tkdn_percent,
  detail.item_dasar_id,
  detail.source_table,
  detail.overrides_id,
  SUM(al.volume * detail.koefisien)                          AS total_volume_terpakai,
  SUM(al.volume * detail.subtotal)                           AS kontribusi_nilai,
  SUM(al.volume * detail.subtotal * (detail.tkdn / 100.0))   AS nilai_tkdn
FROM public.ahsp_lines al
JOIN public.view_katalog_ahsp_lengkap vk ON vk.master_ahsp_id = al.master_ahsp_id
CROSS JOIN LATERAL jsonb_to_recordset(vk.details) AS detail(
  uraian         TEXT,
  kode_item      TEXT,
  satuan         TEXT,
  koefisien      NUMERIC,
  harga_konversi NUMERIC,
  jenis_komponen TEXT,
  subtotal       NUMERIC,
  tkdn           NUMERIC,
  item_dasar_id  UUID,
  source_table   TEXT,
  overrides_id   UUID
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
  detail.tkdn,
  detail.item_dasar_id,
  detail.source_table,
  detail.overrides_id;

GRANT SELECT ON public.view_project_resource_summary TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;
NOTIFY pgrst, 'reload schema';
