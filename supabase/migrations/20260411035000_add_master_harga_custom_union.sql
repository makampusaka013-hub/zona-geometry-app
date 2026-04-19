-- 1. Penambahan Kolom user_id dan tkdn_percent ke tabel master_harga_custom
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS tkdn_percent numeric DEFAULT 0;

-- Setel user_id dengan default auth.uid() agar mudah saat insert
ALTER TABLE public.master_harga_custom ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Keamanan RLS Baru, membatasi CRUD khusus pemilik data
ALTER TABLE public.master_harga_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mhc_admin_pro_all ON public.master_harga_custom;
DROP POLICY IF EXISTS mhc_user_policy ON public.master_harga_custom;

CREATE POLICY mhc_user_policy ON public.master_harga_custom
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Pembuatan View Gabungan (UNION ALL) dengan fitur Security Invoker
DROP VIEW IF EXISTS public.view_master_harga_gabungan CASCADE;

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
  'Custom Anda' AS sumber, 
  'master_harga_custom' AS source_table,
  1 AS urutan_prioritas
FROM public.master_harga_custom
UNION ALL
SELECT 
  id, 
  NULL AS user_id,
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
  'Resmi' AS sumber, 
  'master_harga_dasar' AS source_table,
  2 AS urutan_prioritas
FROM public.master_harga_dasar;

-- Memastikan PostgREST me-reload schema
NOTIFY pgrst, 'reload schema';
