-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: FIX SYNC CATALOG CONVERSION FACTOR
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_all_catalog_to_konversi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- 1. Tarik semua item UNIK dari AHSP
  -- 2. Ambil faktor_konversi asli dari master_ahsp_details
  -- 3. Hubungkan otomatis jika Nama & Satuan sama persis dengan Katalog
  INSERT INTO public.master_konversi (uraian_ahsp, satuan_ahsp, item_dasar_id, faktor_konversi, kode_item_dasar)
  SELECT DISTINCT ON (mad.uraian_ahsp, mad.satuan_uraian)
    mad.uraian_ahsp, 
    mad.satuan_uraian, 
    mhd.id, 
    COALESCE(mad.faktor_konversi, 1), -- Ambil faktor asli dari AHSP, default ke 1
    mhd.kode_item
  FROM public.master_ahsp_details mad
  LEFT JOIN public.master_harga_dasar mhd ON 
    LOWER(TRIM(mhd.nama_item)) = LOWER(TRIM(mad.uraian_ahsp)) 
    AND LOWER(TRIM(mhd.satuan)) = LOWER(TRIM(mad.satuan_uraian))
  WHERE mad.uraian_ahsp IS NOT NULL
  ON CONFLICT (uraian_ahsp, satuan_ahsp) 
  DO UPDATE SET 
    item_dasar_id = COALESCE(master_konversi.item_dasar_id, EXCLUDED.item_dasar_id),
    kode_item_dasar = COALESCE(master_konversi.kode_item_dasar, EXCLUDED.kode_item_dasar),
    -- Update faktor jika sebelumnya masih 1 tapi di data AHSP baru ada nilainya
    faktor_konversi = CASE 
      WHEN master_konversi.faktor_konversi = 1 THEN EXCLUDED.faktor_konversi 
      ELSE master_konversi.faktor_konversi 
    END;

  GET DIAGNOSTICS v_count = row_count;

  RETURN jsonb_build_object(
    'success', true,
    'synced_count', v_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
