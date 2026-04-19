-- File: 20260411050000_auto_price_match_by_code.sql
-- Root Cause Fix: View sebelumnya GAGAL jika item_dasar_id di master_konversi belum di-set (mapping manual belum dilakukan).
-- Perbaikan Kunci: Tambahkan path auto-match via kode_item_dasar → master_harga_dasar.kode_item
-- sehingga override BEKERJA OTOMATIS tanpa mapping manual.

DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

CREATE VIEW public.view_katalog_ahsp_lengkap
  WITH (security_invoker = true)
AS
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
    mad.uraian_ahsp   AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,
    mad.kode_item_dasar AS ahsp_kode_item_dasar,

    -- =============================================================
    -- RESOLUSI ITEM PUPR (2 jalur):
    --   Jalur A (prioritas): via master_konversi.item_dasar_id (UUID eksplisit)
    --   Jalur B (fallback) : via kode_item_dasar langsung ke master_harga_dasar.kode_item
    -- =============================================================

    -- Harga PUPR efektif (gabungan dari jalur A dan B)
    COALESCE(mhd_a.harga_satuan, mhd_b.harga_satuan, 0::numeric)   AS harga_pupr,
    COALESCE(mhd_a.tkdn_percent, mhd_b.tkdn_percent, 0::numeric)   AS tkdn_pupr,
    COALESCE(mhd_a.kode_item,   mhd_b.kode_item)                   AS kode_pupr,
    -- ID item PUPR yang ter-resolve (dipakai untuk cari override)
    COALESCE(mhd_a.id, mhd_b.id)                                   AS resolved_pupr_id,

    -- Faktor konversi dari master_konversi (jalur A saja)
    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric)   AS faktor_efektif

  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id

  -- JALUR A: via master_konversi → item_dasar_id (sudah mapping)
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp  = mad.uraian_ahsp
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)
  LEFT JOIN public.master_harga_dasar mhd_a ON mhd_a.id = mk.item_dasar_id

  -- JALUR B: fallback otomatis via kode_item_dasar → kode_item
  LEFT JOIN public.master_harga_dasar mhd_b
         ON mhd_b.kode_item  = mad.kode_item_dasar
        AND mhd_a.id IS NULL  -- hanya aktif jika jalur A tidak menghasilkan data
),
-- Setelah resolve PUPR, cari override milik user login
enriched AS (
  SELECT
    dc.*,

    -- Override: item custom milik user untuk PUPR yang ter-resolve
    -- mhc_override.user_id = auth.uid() → dijamin oleh security_invoker
    mhc_ov.harga_satuan  AS ov_harga,
    mhc_ov.tkdn_percent  AS ov_tkdn,
    mhc_ov.kode_item     AS ov_kode,
    mhc_ov.id            AS ov_id,

    -- HARGA EFEKTIF AKHIR:
    -- Prioritas: override user > PUPR (jalur A atau B)
    COALESCE(mhc_ov.harga_satuan, dc.harga_pupr, 0::numeric) AS harga_toko,
    COALESCE(mhc_ov.tkdn_percent, dc.tkdn_pupr,  0::numeric) AS detail_tkdn,
    COALESCE(mhc_ov.kode_item,   dc.kode_pupr)               AS detail_kode_item,

    CASE
      WHEN mhc_ov.id IS NOT NULL THEN 'override'
      WHEN dc.harga_pupr > 0    THEN 'pupr'
      ELSE 'unknown'
    END AS sumber_harga

  FROM detail_calc dc
  LEFT JOIN public.master_harga_custom mhc_ov
         ON mhc_ov.overrides_harga_dasar_id = dc.resolved_pupr_id
        AND mhc_ov.user_id = auth.uid()
        AND dc.resolved_pupr_id IS NOT NULL
),
-- Kalkulasi subtotal & nilai TKDN per baris
calced AS (
  SELECT
    e.*,
    (e.harga_toko / e.faktor_efektif) * COALESCE(e.koefisien, 0) AS subtotal,
    ((e.harga_toko / e.faktor_efektif) * COALESCE(e.koefisien, 0))
      * (e.detail_tkdn / 100.0) AS nilai_tkdn,

    CASE
      WHEN upper(substring(trim(COALESCE(e.detail_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(e.detail_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(e.detail_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM enriched e
)
SELECT
  master_ahsp_id,
  kode_ahsp,
  MAX(nama_pekerjaan)     AS nama_pekerjaan,
  MAX(divisi)             AS divisi,
  MAX(jenis_pekerjaan)    AS jenis_pekerjaan,
  MAX(kategori_pekerjaan) AS kategori_pekerjaan,
  MAX(satuan_pekerjaan)   AS satuan_pekerjaan,
  MAX(overhead_profit)    AS overhead_profit,

  SUM(CASE WHEN jenis_komponen = 'upah'  THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_upah,
  SUM(CASE WHEN jenis_komponen = 'bahan' THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_bahan,
  SUM(CASE WHEN jenis_komponen = 'alat'  THEN COALESCE(subtotal, 0) ELSE 0 END) AS total_alat,
  SUM(COALESCE(subtotal, 0))  AS total_subtotal,

  MIN(COALESCE(subtotal, 0))  AS min_subtotal_item,
  CASE
    WHEN MIN(COALESCE(subtotal, 0)) > 0 AND SUM(COALESCE(subtotal, 0)) > 0 THEN true
    ELSE false
  END AS is_lengkap,

  CASE WHEN SUM(COALESCE(subtotal, 0)) > 0
       THEN (SUM(COALESCE(nilai_tkdn, 0)) / SUM(COALESCE(subtotal, 0))) * 100
       ELSE 0
  END AS total_tkdn_percent,

  json_agg(
    json_build_object(
      'uraian',         detail_uraian,
      'kode_item',      detail_kode_item,
      'satuan',         detail_satuan,
      'koefisien',      koefisien,
      'harga_konversi', (harga_toko / faktor_efektif),
      'jenis_komponen', jenis_komponen,
      'subtotal',       subtotal,
      'tkdn',           detail_tkdn,
      'sumber_harga',   sumber_harga
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details

FROM calced
GROUP BY master_ahsp_id, kode_ahsp;

-- View ringkasan (kompatibel dengan modul RAB)
CREATE VIEW public.view_analisa_ahsp AS
SELECT
  master_ahsp_id     AS id,
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

NOTIFY pgrst, 'reload schema';
