-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: ADD HIERARCHY COLUMNS & UPDATE UPLOAD RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tambah Kolom ke master_harga_dasar
ALTER TABLE public.master_harga_dasar ADD COLUMN IF NOT EXISTS sumber text DEFAULT 'Lokal';
ALTER TABLE public.master_harga_dasar ADD COLUMN IF NOT EXISTS kategori_utama text DEFAULT 'Lainnya';
ALTER TABLE public.master_harga_dasar ADD COLUMN IF NOT EXISTS sub_kategori text DEFAULT '-';

-- 2. Tambah Kolom ke master_harga_custom
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS sumber text DEFAULT 'Lokal';
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS kategori_utama text DEFAULT 'Lainnya';
ALTER TABLE public.master_harga_custom ADD COLUMN IF NOT EXISTS sub_kategori text DEFAULT '-';

-- 3. Update Fungsi RPC upload_harga_dasar_csv
CREATE OR REPLACE FUNCTION public.upload_harga_dasar_csv(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_no_urut integer;
  v_nama_item text;
  v_kode_item text;
  v_satuan text;
  v_harga_satuan numeric;
  v_keterangan text;
  v_tkdn_persen numeric;
  v_status text;
  -- Kolom Baru
  v_sumber text;
  v_kategori_utama text;
  v_sub_kategori text;
  -- Konteks Lokasi
  v_loc_id uuid;
  v_updated int := 0;
  v_inserted int := 0;
BEGIN
  -- Ambil lokasi terpilih user dari profile
  SELECT selected_location_id INTO v_loc_id FROM public.members WHERE user_id = auth.uid();
  
  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'Lokasi belum dipilih. Silakan pilih lokasi di dashboard.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m 
    WHERE m.user_id = auth.uid() AND m.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: only admin can upload CSV';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_no_urut := nullif(trim(v_row->>'no_urut'), '')::integer;
    v_nama_item := nullif(trim(v_row->>'nama_item'), '');
    v_kode_item := nullif(trim(v_row->>'kode_item'), '');
    v_satuan := nullif(trim(v_row->>'satuan'), '');
    v_harga_satuan := (nullif(replace(trim(v_row->>'harga_satuan'), ',', '.'), ''))::numeric;
    v_keterangan := nullif(trim(v_row->>'keterangan'), '');
    v_tkdn_persen := (nullif(replace(trim(v_row->>'tkdn_percent'), ',', '.'), ''))::numeric;
    v_status := nullif(trim(v_row->>'status'), '');
    -- Mapping Hirarki Baru
    v_sumber := COALESCE(nullif(trim(v_row->>'sumber'), ''), 'Lokal');
    v_kategori_utama := COALESCE(nullif(trim(v_row->>'kategori_utama'), ''), 'Lainnya');
    v_sub_kategori := COALESCE(nullif(trim(v_row->>'sub_kategori'), ''), '-');

    IF v_kode_item IS NULL OR v_harga_satuan IS NULL THEN CONTINUE; END IF;

    -- Update by kode_item AND location_id (Penting untuk regional pricing)
    IF EXISTS (SELECT 1 FROM public.master_harga_dasar WHERE kode_item = v_kode_item AND location_id = v_loc_id) THEN
      UPDATE public.master_harga_dasar SET
        no_urut = COALESCE(v_no_urut, no_urut),
        nama_item = COALESCE(v_nama_item, nama_item),
        satuan = COALESCE(v_satuan, satuan),
        harga_satuan = v_harga_satuan,
        keterangan = COALESCE(v_keterangan, keterangan),
        tkdn_persen = COALESCE(v_tkdn_persen, tkdn_persen),
        status = COALESCE(v_status, status),
        sumber = v_sumber,
        kategori_utama = v_kategori_utama,
        sub_kategori = v_sub_kategori,
        updated_at = now()
      WHERE kode_item = v_kode_item AND location_id = v_loc_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.master_harga_dasar (
        location_id, no_urut, nama_item, kode_item, satuan, harga_satuan, 
        keterangan, tkdn_persen, status, sumber, kategori_utama, sub_kategori
      ) VALUES (
        v_loc_id, v_no_urut, v_nama_item, v_kode_item, v_satuan, v_harga_satuan,
        v_keterangan, v_tkdn_persen, v_status, v_sumber, v_kategori_utama, v_sub_kategori
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'inserted', v_inserted);
END;
$$;

NOTIFY pgrst, 'reload schema';
