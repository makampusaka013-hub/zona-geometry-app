-- Enforce Row Level Security (RLS) on Master Data Tables
-- Created: 2026-04-15
-- Target Tables: master_konversi, master_ahsp, master_harga_dasar

-- -----------------------------------------------------------------------------
-- 1. master_konversi
-- -----------------------------------------------------------------------------
ALTER TABLE public.master_konversi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_master_konversi ON public.master_konversi;
DROP POLICY IF EXISTS insert_master_konversi ON public.master_konversi;
DROP POLICY IF EXISTS update_master_konversi ON public.master_konversi;
DROP POLICY IF EXISTS delete_master_konversi ON public.master_konversi;

-- All authenticated users can read master conversion data
CREATE POLICY select_master_konversi ON public.master_konversi 
FOR SELECT TO authenticated 
USING (true);

-- Only Admins can modify master conversion data
CREATE POLICY insert_master_konversi ON public.master_konversi 
FOR INSERT TO authenticated 
WITH CHECK ( public.is_app_admin() );

CREATE POLICY update_master_konversi ON public.master_konversi 
FOR UPDATE TO authenticated 
USING ( public.is_app_admin() );

CREATE POLICY delete_master_konversi ON public.master_konversi 
FOR DELETE TO authenticated 
USING ( public.is_app_admin() );


-- -----------------------------------------------------------------------------
-- 2. master_ahsp
-- -----------------------------------------------------------------------------
ALTER TABLE public.master_ahsp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_master_ahsp ON public.master_ahsp;
DROP POLICY IF EXISTS insert_master_ahsp ON public.master_ahsp;
DROP POLICY IF EXISTS update_master_ahsp ON public.master_ahsp;
DROP POLICY IF EXISTS delete_master_ahsp ON public.master_ahsp;

-- All authenticated users can read master AHSP data
CREATE POLICY select_master_ahsp ON public.master_ahsp 
FOR SELECT TO authenticated 
USING (true);

-- Only Admins can modify master AHSP data
CREATE POLICY insert_master_ahsp ON public.master_ahsp 
FOR INSERT TO authenticated 
WITH CHECK ( public.is_app_admin() );

CREATE POLICY update_master_ahsp ON public.master_ahsp 
FOR UPDATE TO authenticated 
USING ( public.is_app_admin() );

CREATE POLICY delete_master_ahsp ON public.master_ahsp 
FOR DELETE TO authenticated 
USING ( public.is_app_admin() );


-- -----------------------------------------------------------------------------
-- 3. master_harga_dasar
-- -----------------------------------------------------------------------------
ALTER TABLE public.master_harga_dasar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS insert_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS update_master_harga_dasar ON public.master_harga_dasar;
DROP POLICY IF EXISTS delete_master_harga_dasar ON public.master_harga_dasar;

-- All authenticated users can read master base price data
CREATE POLICY select_master_harga_dasar ON public.master_harga_dasar 
FOR SELECT TO authenticated 
USING (true);

-- Only Admins can modify master base price data
CREATE POLICY insert_master_harga_dasar ON public.master_harga_dasar 
FOR INSERT TO authenticated 
WITH CHECK ( public.is_app_admin() );

CREATE POLICY update_master_harga_dasar ON public.master_harga_dasar 
FOR UPDATE TO authenticated 
USING ( public.is_app_admin() );

CREATE POLICY delete_master_harga_dasar ON public.master_harga_dasar 
FOR DELETE TO authenticated 
USING ( public.is_app_admin() );


-- -----------------------------------------------------------------------------
-- 4. Reload Schema
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
