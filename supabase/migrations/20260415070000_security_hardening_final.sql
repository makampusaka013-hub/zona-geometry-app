-- Security Hardening: Enforce RLS on Profiles & Set Views to SECURITY INVOKER
-- Created: 2026-04-15
-- Target: profiles (RLS), view_debug_analisa (Invoker), view_konversi_harga (Invoker)

-- 1. Enforce RLS on profiles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        -- Enable RLS
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- Clean up existing policies
        DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;
        DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
        DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
        DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

        -- Create robust policies
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
            CREATE POLICY profiles_select_policy ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_app_admin());
            CREATE POLICY profiles_insert_policy ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
            CREATE POLICY profiles_update_policy ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_app_admin()) WITH CHECK (auth.uid() = id OR public.is_app_admin());
            CREATE POLICY profiles_delete_policy ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id OR public.is_app_admin());
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
            CREATE POLICY profiles_select_policy ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());
            CREATE POLICY profiles_insert_policy ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
            CREATE POLICY profiles_update_policy ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin()) WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
            CREATE POLICY profiles_delete_policy ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());
        END IF;
    END IF;
END $$;


-- 2. HARDEN VIEW: view_debug_analisa
-- By recreating with WITH (security_invoker = true)
DROP VIEW IF EXISTS public.view_debug_analisa CASCADE;
CREATE OR REPLACE VIEW public.view_debug_analisa 
WITH (security_invoker = true) 
AS
SELECT
  ma.kode_ahsp,
  ma.nama_pekerjaan,
  coalesce(mhd.nama_item, mad.uraian_ahsp) as nama_komponen,
  mhd.kode_item as kode_komponen,
  mad.koefisien,
  coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric) as faktor_konversi,
  mad.satuan_uraian,
  mhd.harga_satuan as harga_toko,
  (coalesce(mhd.harga_satuan, 0) / coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric)) as harga_dasar,
  (coalesce(mhd.harga_satuan, 0) / coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal_item,
  (coalesce(mhd.harga_satuan, 0) / coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal,
  coalesce(ma.overhead_profit, 15::numeric) as overhead_profit
FROM public.master_ahsp ma
JOIN public.master_ahsp_details mad ON mad.ahsp_id = ma.id
LEFT JOIN public.master_konversi mk ON mk.uraian_ahsp = mad.uraian_ahsp AND (mk.satuan_ahsp IS NOT DISTINCT FROM mad.satuan_uraian)
LEFT JOIN public.master_harga_dasar mhd ON mhd.id = mk.item_dasar_id;


-- 3. HARDEN VIEW: view_konversi_harga
DROP VIEW IF EXISTS public.view_konversi_harga CASCADE;
CREATE OR REPLACE VIEW public.view_konversi_harga 
WITH (security_invoker = true)
AS
SELECT 
  mk.id as konversi_id,
  mk.uraian_ahsp,
  mk.satuan_ahsp,
  mk.faktor_konversi,
  mk.kode_item_dasar,
  mhd.id as item_dasar_id,
  mhd.nama_item,
  mhd.satuan,
  mhd.harga_satuan,
  (coalesce(mhd.harga_satuan, 0) / coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric)) as harga_terkonversi
FROM public.master_konversi mk
LEFT JOIN public.master_harga_dasar mhd ON mk.item_dasar_id = mhd.id;


-- 4. Reload Schema for good measure
NOTIFY pgrst, 'reload schema';
