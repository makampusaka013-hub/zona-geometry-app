-- Penyatuan Kolom TKDN dan Pemindahan Data (Jika ada)
DO $$ 
BEGIN 
  -- Pastikan kolom utama exist
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='master_harga_dasar' and column_name='tkdn_percent') THEN
     ALTER TABLE public.master_harga_dasar ADD COLUMN tkdn_percent numeric DEFAULT 0;
  END IF;

  -- Jika secara tidak sengaja ada kolom tkdn_persen, pindahkan datanya ke tkdn_percent lalu hapus
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='master_harga_dasar' and column_name='tkdn_persen') THEN
      UPDATE public.master_harga_dasar 
      SET tkdn_percent = tkdn_persen 
      WHERE tkdn_persen IS NOT NULL AND tkdn_persen > 0 AND (tkdn_percent IS NULL OR tkdn_percent = 0);
      
      -- Drop views that might depend on the column before we drop the column
      DROP VIEW IF EXISTS public.view_analisa_ahsp CASCADE;
      DROP VIEW IF EXISTS public.view_katalog_ahsp_lengkap CASCADE;

      ALTER TABLE public.master_harga_dasar DROP COLUMN tkdn_persen;
  END IF; 
END $$;

NOTIFY pgrst, 'reload schema';
