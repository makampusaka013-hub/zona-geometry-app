-- =============================================================================
-- SECURITY HARDENING: RESTORING UNIFIED AHSP VIEWS
-- Resolves regression where view_katalog_ahsp_gabungan was dropped by CASCADE
-- and view_analisa_ahsp lost custom data support.
-- =============================================================================

-- 1. view_katalog_ahsp_gabungan
-- Menggabungkan AHSP Resmi (PUPR) dan AHSP Custom (User)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
DROP VIEW IF EXISTS public.view_katalog_ahsp_gabungan CASCADE;

CREATE OR REPLACE VIEW public.view_katalog_ahsp_gabungan WITH (security_invoker = true) AS
SELECT
  master_ahsp_id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  kategori_pekerjaan,
  jenis_pekerjaan,
  overhead_profit,
  total_upah,
  total_bahan,
  total_alat,
  total_subtotal,
  total_tkdn_percent,
  true AS is_custom,
  1 AS urutan_prioritas,
  details,
  true AS is_lengkap -- Custom AHSP dianggap lengkap jika ada rinciannya
FROM public.view_katalog_ahsp_custom
UNION ALL
SELECT
  master_ahsp_id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  kategori_pekerjaan,
  jenis_pekerjaan,
  overhead_profit,
  total_upah,
  total_bahan,
  total_alat,
  total_subtotal,
  total_tkdn_percent,
  false AS is_custom,
  2 AS urutan_prioritas,
  details,
  is_lengkap
FROM public.view_katalog_ahsp_lengkap;


-- 2. view_analisa_ahsp (Unified Version)
-- Versi ringkas untuk kompatibilitas legacy, mengambil dari versi gabungan
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_analisa_ahsp WITH (security_invoker = true) AS
SELECT
  master_ahsp_id AS id,
  kode_ahsp,
  nama_pekerjaan,
  satuan_pekerjaan,
  total_subtotal,
  total_upah,
  total_bahan,
  total_alat,
  total_tkdn_percent,
  is_lengkap,
  is_custom,
  urutan_prioritas
FROM public.view_katalog_ahsp_gabungan;


-- 3. Grants
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.view_katalog_ahsp_gabungan TO authenticated;
GRANT SELECT ON public.view_analisa_ahsp TO authenticated;


-- 4. Reload PostgREST Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
