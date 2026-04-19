-- File: 20260411060000_fix_rls_user_ahsp_override.sql
-- Fix: Error 'new row violates RLS policy for table user_ahsp_price_override'
-- Root cause: kolom user_id tidak punya DEFAULT, sehingga INSERT dari client
-- mengirim user_id = NULL dan policy USING (user_id = auth.uid()) gagal.

-- STEP 1: Tambah DEFAULT auth.uid() agar otomatis terisi saat INSERT
ALTER TABLE public.user_ahsp_price_override
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- STEP 2: Pastikan policy INSERT menggunakan WITH CHECK yang benar
-- (DROP dulu jika sudah ada, lalu buat ulang)
DROP POLICY IF EXISTS uapo_user_policy ON public.user_ahsp_price_override;

CREATE POLICY uapo_user_policy ON public.user_ahsp_price_override
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- STEP 3: Tambah policy khusus INSERT agar lebih eksplisit
DROP POLICY IF EXISTS uapo_insert_policy ON public.user_ahsp_price_override;

CREATE POLICY uapo_insert_policy ON public.user_ahsp_price_override
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

NOTIFY pgrst, 'reload schema';
