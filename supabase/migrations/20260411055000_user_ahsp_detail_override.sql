-- File: 20260411055000_user_ahsp_detail_override.sql
-- Tujuan: Memungkinkan User Pro memilih sumber harga per-baris rincian AHSP secara personal.
-- Setiap user Pro punya "lapisan" kustomisasi mereka sendiri di atas AHSP default PUPR.

-- =================================================================
-- STEP 1: Tabel user_ahsp_price_override
--         Menyimpan pilihan harga personal per user per baris detail AHSP
-- =================================================================
CREATE TABLE IF NOT EXISTS public.user_ahsp_price_override (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ahsp_detail_id  uuid NOT NULL REFERENCES public.master_ahsp_details(id) ON DELETE CASCADE,

  -- Sumber harga yang dipilih user (FK ke salah satu tabel harga)
  harga_item_id   uuid,         -- UUID dari master_harga_dasar ATAU master_harga_custom
  source_table    text,         -- 'master_harga_dasar' atau 'master_harga_custom' atau null

  -- Quick override langsung (tanpa harus link ke item katalog)
  harga_langsung  numeric,
  tkdn_langsung   numeric,
  catatan         text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 1 user hanya punya 1 override per baris detail AHSP
  UNIQUE (user_id, ahsp_detail_id)
);

-- Trigger update timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at_uapo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS uapo_updated_at ON public.user_ahsp_price_override;
CREATE TRIGGER uapo_updated_at
  BEFORE UPDATE ON public.user_ahsp_price_override
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_uapo();

-- RLS: user hanya bisa lihat & kelola data miliknya sendiri
ALTER TABLE public.user_ahsp_price_override ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uapo_user_policy ON public.user_ahsp_price_override;
CREATE POLICY uapo_user_policy ON public.user_ahsp_price_override
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =================================================================
-- STEP 2: Rebuild view dengan Lvl 0 = per-detail user override
--         Priority chain (5 level):
--         0. user_ahsp_price_override (harga user, PER BARIS DETAIL, paling spesifik)
--         1. mhc_override (override global user per item PUPR)
--         2. master_konversi UUID mapping (admin mapping)
--         3. auto-match by kode_item_dasar
-- =================================================================
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

CREATE VIEW public.view_katalog_ahsp_lengkap
  WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    ma.id                 AS master_ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.jenis_pekerjaan,
    ma.kategori_pekerjaan,
    ma.satuan_pekerjaan,
    COALESCE(ma.overhead_profit, 15::numeric) AS overhead_profit,
    mad.id                AS ahsp_detail_id,   -- <<< penting untuk override lookup
    mad.uraian_ahsp       AS detail_uraian,
    mad.satuan_uraian     AS detail_satuan,
    mad.koefisien,
    mad.kode_item_dasar   AS ahsp_kode

  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
),
-- LEVEL 0: Per-detail override oleh user ini
lvl0 AS (
  SELECT
    b.*,
    uapo.harga_item_id    AS ov0_item_id,
    uapo.source_table     AS ov0_source,
    uapo.harga_langsung   AS ov0_harga_direct,
    uapo.tkdn_langsung    AS ov0_tkdn_direct
  FROM base b
  LEFT JOIN public.user_ahsp_price_override uapo
         ON uapo.ahsp_detail_id = b.ahsp_detail_id
        AND uapo.user_id = auth.uid()
),
-- Resolve harga dari ov0_item_id (bisa PUPR atau custom)
lvl0_resolved AS (
  SELECT
    l.*,
    mhd_ov.harga_satuan  AS ov0_harga_pupr,
    mhd_ov.tkdn_percent  AS ov0_tkdn_pupr,
    mhd_ov.kode_item     AS ov0_kode_pupr,
    mhc_ov.harga_satuan  AS ov0_harga_custom,
    mhc_ov.tkdn_percent  AS ov0_tkdn_custom,
    mhc_ov.kode_item     AS ov0_kode_custom
  FROM lvl0 l
  LEFT JOIN public.master_harga_dasar mhd_ov
         ON mhd_ov.id = l.ov0_item_id AND l.ov0_source = 'master_harga_dasar'
  LEFT JOIN public.master_harga_custom mhc_ov
         ON mhc_ov.id = l.ov0_item_id AND l.ov0_source = 'master_harga_custom'
),
-- LEVEL 1-3: PUPR default + global override + konversi mapping
base_price AS (
  SELECT
    l.*,
    -- Global override per item PUPR (dari master_harga_custom.overrides_harga_dasar_id)
    mhc_glob.harga_satuan AS glob_harga,
    mhc_glob.tkdn_percent AS glob_tkdn,
    mhc_glob.kode_item    AS glob_kode,
    -- Konversi UUID mapping
    mk.faktor_konversi,
    mhd_mk.harga_satuan   AS mk_harga,
    mhd_mk.tkdn_percent   AS mk_tkdn,
    mhd_mk.kode_item      AS mk_kode,
    mhd_mk.id             AS mk_pupr_id,
    -- Auto-match by kode_item_dasar (fallback tanpa mapping)
    mhd_auto.harga_satuan AS auto_harga,
    mhd_auto.tkdn_percent AS auto_tkdn,
    mhd_auto.kode_item    AS auto_kode
  FROM lvl0_resolved l
  -- Konversi mapping (admin)
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp = l.detail_uraian
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM l.detail_satuan)
  LEFT JOIN public.master_harga_dasar mhd_mk ON mhd_mk.id = mk.item_dasar_id
  -- Auto-match by kode
  LEFT JOIN public.master_harga_dasar mhd_auto
         ON mhd_auto.kode_item = l.ahsp_kode
        AND mhd_mk.id IS NULL
  -- Global override (per item PUPR, berlaku setelah PUPR ter-resolve)
  LEFT JOIN public.master_harga_custom mhc_glob
         ON mhc_glob.overrides_harga_dasar_id = COALESCE(mhd_mk.id, mhd_auto.id)
        AND mhc_glob.user_id = auth.uid()
),
-- FINAL: Resolusi harga dengan COALESCE 5-level
final_calc AS (
  SELECT
    bp.*,

    -- Harga efektif akhir (prioritas terbaik ke terburuk)
    COALESCE(
      bp.ov0_harga_direct,           -- 0a: quick override langsung
      bp.ov0_harga_custom,           -- 0b: custom item dipilih user
      bp.ov0_harga_pupr,             -- 0c: PUPR item dipilih user
      bp.glob_harga,                 -- 1:  global override per item PUPR
      bp.mk_harga,                   -- 2:  konversi mapping UUID
      bp.auto_harga,                 -- 3:  auto-match by kode
      0::numeric
    ) AS harga_toko,

    COALESCE(
      bp.ov0_tkdn_direct,
      bp.ov0_tkdn_custom,
      bp.ov0_tkdn_pupr,
      bp.glob_tkdn,
      bp.mk_tkdn,
      bp.auto_tkdn,
      0::numeric
    ) AS detail_tkdn,

    COALESCE(
      bp.ov0_kode_custom,
      bp.ov0_kode_pupr,
      bp.glob_kode,
      bp.mk_kode,
      bp.auto_kode
    ) AS detail_kode_item,

    COALESCE(NULLIF(bp.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,

    CASE
      WHEN bp.ov0_harga_direct IS NOT NULL     THEN 'override-langsung'
      WHEN bp.ov0_item_id IS NOT NULL          THEN 'override-katalog'
      WHEN bp.glob_harga IS NOT NULL           THEN 'override-global'
      WHEN bp.mk_harga IS NOT NULL             THEN 'pupr-mapped'
      WHEN bp.auto_harga IS NOT NULL           THEN 'pupr-auto'
      ELSE 'kosong'
    END AS sumber_harga

  FROM base_price bp
),
-- Kalkulasi subtotal & TKDN
computed AS (
  SELECT
    fc.*,
    (fc.harga_toko / fc.faktor_efektif) * COALESCE(fc.koefisien, 0) AS subtotal,
    ((fc.harga_toko / fc.faktor_efektif) * COALESCE(fc.koefisien, 0))
      * (fc.detail_tkdn / 100.0) AS nilai_tkdn,

    CASE
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) IN ('A','B') THEN 'bahan'
      WHEN upper(substring(trim(COALESCE(fc.detail_kode_item, '')), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen
  FROM final_calc fc
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
      'uraian',          detail_uraian,
      'detail_id',       ahsp_detail_id,   -- <<< disertakan agar UI bisa save override
      'kode_item',       detail_kode_item,
      'satuan',          detail_satuan,
      'koefisien',       koefisien,
      'harga_konversi',  (harga_toko / faktor_efektif),
      'jenis_komponen',  jenis_komponen,
      'subtotal',        subtotal,
      'tkdn',            detail_tkdn,
      'sumber_harga',    sumber_harga
    )
  ) FILTER (WHERE detail_uraian IS NOT NULL) AS details

FROM computed
GROUP BY master_ahsp_id, kode_ahsp;

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
