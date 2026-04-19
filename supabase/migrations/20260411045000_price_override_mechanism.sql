-- File: 20260411045000_price_override_mechanism.sql
-- Tujuan: Menambah mekanisme "Override Harga" per user.
-- User Pro bisa mendaftarkan harga custom sebagai pengganti item PUPR tertentu.
-- View AHSP akan membaca auth.uid() secara real-time untuk injeksi harga dinamis.

-- ============================================================
-- STEP 1: Tambah kolom overrides_harga_dasar_id ke master_harga_custom
--         Ini adalah "kunci pencocokan": 1 user, 1 override per item PUPR
-- ============================================================
ALTER TABLE public.master_harga_custom
  ADD COLUMN IF NOT EXISTS overrides_harga_dasar_id uuid REFERENCES public.master_harga_dasar(id) ON DELETE SET NULL;

-- Constraint: 1 user hanya boleh punya 1 override per item PUPR
ALTER TABLE public.master_harga_custom
  DROP CONSTRAINT IF EXISTS uq_user_override_per_pupr_item;

ALTER TABLE public.master_harga_custom
  ADD CONSTRAINT uq_user_override_per_pupr_item
  UNIQUE (user_id, overrides_harga_dasar_id);

-- ============================================================
-- STEP 2: Rebuild View dengan security_invoker + Triple JOIN
-- Prioritas harga: override user > mapping langsung custom > default PUPR
-- ============================================================
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

CREATE VIEW public.view_katalog_ahsp_lengkap
  WITH (security_invoker = true) -- Penting: view berjalan sebagai user yang login
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
    mad.uraian_ahsp AS detail_uraian,
    mad.satuan_uraian AS detail_satuan,
    mad.koefisien,

    -- PRIORITAS HARGA (3 LEVEL):
    -- Lvl 1: mhc_override → custom override milik user ini untuk item PUPR
    -- Lvl 2: mhc_direct   → item custom yang langsung di-map ke master_konversi
    -- Lvl 3: mhd          → default PUPR
    COALESCE(mhc_override.kode_item, mhc_direct.kode_item, mhd.kode_item) AS detail_kode_item,
    COALESCE(mhc_override.harga_satuan, mhc_direct.harga_satuan, mhd.harga_satuan, 0) AS harga_toko,
    COALESCE(mhc_override.tkdn_percent, mhc_direct.tkdn_percent, mhd.tkdn_percent, 0) AS detail_tkdn,

    COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric) AS faktor_efektif,

    (COALESCE(mhc_override.harga_satuan, mhc_direct.harga_satuan, mhd.harga_satuan, 0)
      / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric))
      * COALESCE(mad.koefisien, 0) AS subtotal,

    ((COALESCE(mhc_override.harga_satuan, mhc_direct.harga_satuan, mhd.harga_satuan, 0)
      / COALESCE(NULLIF(mk.faktor_konversi, 0::numeric), 1::numeric))
      * COALESCE(mad.koefisien, 0))
      * (COALESCE(mhc_override.tkdn_percent, mhc_direct.tkdn_percent, mhd.tkdn_percent, 0) / 100.0) AS nilai_tkdn,

    -- Label sumber harga aktif untuk UI (info transparency)
    CASE
      WHEN mhc_override.id IS NOT NULL THEN 'override'
      WHEN mhc_direct.id  IS NOT NULL THEN 'custom'
      ELSE 'pupr'
    END AS sumber_harga,

    CASE
      WHEN upper(substring(trim(coalesce(
        COALESCE(mhc_override.kode_item, mhc_direct.kode_item, mhd.kode_item), ''
      )), 1, 1)) = 'L' THEN 'upah'
      WHEN upper(substring(trim(coalesce(
        COALESCE(mhc_override.kode_item, mhc_direct.kode_item, mhd.kode_item), ''
      )), 1, 1)) IN ('A', 'B') THEN 'bahan'
      WHEN upper(substring(trim(coalesce(
        COALESCE(mhc_override.kode_item, mhc_direct.kode_item, mhd.kode_item), ''
      )), 1, 1)) = 'M' THEN 'alat'
      ELSE 'lainnya'
    END AS jenis_komponen

  FROM public.master_ahsp ma
  LEFT JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
  LEFT JOIN public.master_konversi mk
         ON mk.uraian_ahsp = mad.uraian_ahsp
        AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)

  -- Lvl 3: Harga PUPR default
  LEFT JOIN public.master_harga_dasar mhd ON mhd.id = mk.item_dasar_id

  -- Lvl 2: Custom yang langsung di-map (item_dasar_id menunjuk ke tabel custom)
  LEFT JOIN public.master_harga_custom mhc_direct ON mhc_direct.id = mk.item_dasar_id

  -- Lvl 1: Override personal user login saat ini untuk item PUPR yang ter-map
  --        security_invoker memastikan auth.uid() = user yang sedang request
  LEFT JOIN public.master_harga_custom mhc_override
         ON mhc_override.overrides_harga_dasar_id = mhd.id
        AND mhc_override.user_id = auth.uid()
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

FROM detail_calc
GROUP BY master_ahsp_id, kode_ahsp;

-- View ringkasan (tetap kompatibel dengan modul RAB dll)
CREATE OR REPLACE VIEW public.view_analisa_ahsp AS
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
