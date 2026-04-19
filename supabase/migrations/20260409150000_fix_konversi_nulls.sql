-- Migration File: Fix Konversi Nulls Constraint
-- Mengatasi isu ON CONFLICT yang gagal mengenali "NULL" sebagai data unik pada kolom satuan

-- 1. Bersihkan duplikat/data tersembunyi (jika UPSERT sebelumnya malah membuat baris baru)
-- Kita ubah semua satuan_ahsp yang NULL menjadi string '-' agar unik-nya bekerja konsisten
UPDATE public.master_konversi SET satuan_ahsp = '-' WHERE satuan_ahsp IS NULL OR trim(satuan_ahsp) = '';
UPDATE public.master_ahsp_details SET satuan_uraian = '-' WHERE satuan_uraian IS NULL OR trim(satuan_uraian) = '';

-- Tambahkan fungsi pencegahan duplikat (deduplication) sebelum apply unique constraint (kalau saja sudah sempat terduplikasi)
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY uraian_ahsp, coalesce(satuan_ahsp, '-') ORDER BY updated_at DESC) as rn
  FROM public.master_konversi
)
DELETE FROM public.master_konversi WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. Modify upload_ahsp_csv untuk SELALU memaksakan satuan kosong menjadi '-'
create or replace function public.upload_ahsp_csv(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;

  v_jenis_pekerjaan text;
  v_kategori_pekerjaan text;
  v_kode_ahsp text;
  v_nama_pekerjaan text;
  v_divisi text;
  v_uraian_ahsp text;
  v_kode_item_dasar text;
  v_koefisien numeric;
  v_satuan_pekerjaan text;
  v_satuan_uraian text;
  v_konversi numeric;

  v_master_ahsp_id uuid;

  v_inserted_headers int := 0;
  v_inserted_details int := 0;
begin
  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'admin'
  ) then
    raise exception 'Forbidden: only admin can upload AHSP CSV';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid input: p_rows must be a JSON array';
  end if;

  for v_row in
    select value
    from jsonb_array_elements(p_rows) as t(value)
  loop
    v_jenis_pekerjaan := nullif(trim(v_row->>'jenis_pekerjaan'), '');
    v_kategori_pekerjaan := nullif(trim(v_row->>'kategori_pekerjaan'), '');
    v_divisi := nullif(trim(v_row->>'divisi'), '');
    v_kode_ahsp := nullif(trim(v_row->>'kode_ahsp'), '');
    v_nama_pekerjaan := nullif(trim(v_row->>'nama_pekerjaan'), '');
    v_uraian_ahsp := nullif(trim(v_row->>'uraian_ahsp'), '');
    v_kode_item_dasar := nullif(trim(v_row->>'kode_item_dasar'), '');
    v_koefisien := nullif(replace(trim(v_row->>'koefisien'), ',', '.'), '')::numeric;
    -- PROTEKSI KONSISTENSI NULL: Kosong = '-'
    v_satuan_pekerjaan := coalesce(nullif(trim(v_row->>'satuan_pekerjaan'), ''), '-');
    v_satuan_uraian := coalesce(nullif(trim(v_row->>'satuan_uraian'), ''), '-');
    
    -- Handle konversi column
    v_konversi := nullif(replace(trim(v_row->>'konversi'), ',', '.'), '')::numeric;

    if v_kode_ahsp is null then
      raise exception 'Row missing kode_ahsp';
    end if;
    if v_uraian_ahsp is null then
      raise exception 'Row missing uraian_ahsp';
    end if;
    if v_koefisien is null then
      raise exception 'Row missing koefisien';
    end if;

    -- HEADER upsert
    select id into v_master_ahsp_id
    from public.master_ahsp
    where kode_ahsp = v_kode_ahsp
    limit 1;

    if v_master_ahsp_id is not null then
      update public.master_ahsp
      set 
        divisi = coalesce(v_divisi, divisi),
        jenis_pekerjaan = coalesce(v_jenis_pekerjaan, jenis_pekerjaan),
        kategori_pekerjaan = coalesce(v_kategori_pekerjaan, kategori_pekerjaan),
        nama_pekerjaan = coalesce(v_nama_pekerjaan, nama_pekerjaan),
        satuan_pekerjaan = coalesce(v_satuan_pekerjaan, satuan_pekerjaan)
      where id = v_master_ahsp_id;
    else
      begin
        insert into public.master_ahsp (
          jenis_pekerjaan,
          kategori_pekerjaan,
          kode_ahsp,
          nama_pekerjaan,
          satuan_pekerjaan,
          divisi
        )
        values (
          v_jenis_pekerjaan,
          v_kategori_pekerjaan,
          v_kode_ahsp,
          v_nama_pekerjaan,
          v_satuan_pekerjaan,
          v_divisi
        )
        returning id into v_master_ahsp_id;
        v_inserted_headers := v_inserted_headers + 1;
      exception
        when unique_violation then
          select id into v_master_ahsp_id
          from public.master_ahsp
          where kode_ahsp = v_kode_ahsp
          limit 1;

          update public.master_ahsp
          set 
            divisi = coalesce(v_divisi, divisi),
            jenis_pekerjaan = coalesce(v_jenis_pekerjaan, jenis_pekerjaan),
            kategori_pekerjaan = coalesce(v_kategori_pekerjaan, kategori_pekerjaan),
            nama_pekerjaan = coalesce(v_nama_pekerjaan, nama_pekerjaan),
            satuan_pekerjaan = coalesce(v_satuan_pekerjaan, satuan_pekerjaan)
          where id = v_master_ahsp_id;
      end;
    end if;

    -- DETAIL insert
    insert into public.master_ahsp_details (
      ahsp_id,
      uraian_ahsp,
      koefisien,
      satuan_uraian,
      kode_item_dasar
    )
    values (
      v_master_ahsp_id,
      v_uraian_ahsp,
      v_koefisien,
      v_satuan_uraian,
      v_kode_item_dasar
    );

    v_inserted_details := v_inserted_details + 1;
  end loop;

  -- Insert/update master_konversi with mapping
  with mk_ins as (
    select distinct 
      val->>'uraian_ahsp' as u_ahsp, 
      -- Paksa pakai string '-' jika tidak ada supaya PostgreSQL UNIQUE ON CONFLICT tetap berjalan! (karena NULL != NULL)
      coalesce(nullif(trim(val->>'satuan_uraian'), ''), '-') as s_uraian,
      nullif(trim(val->>'kode_item_dasar'), '') as k_item,
      nullif(replace(trim(val->>'konversi'), ',', '.'), '')::numeric as f_konv
    from jsonb_array_elements(p_rows) as t(val)
    where val->>'uraian_ahsp' is not null
  )
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp, kode_item_dasar, faktor_konversi)
  select u_ahsp, s_uraian, k_item, coalesce(f_konv, 1)
  from mk_ins
  on conflict (uraian_ahsp, satuan_ahsp) 
  do update set 
    kode_item_dasar = coalesce(EXCLUDED.kode_item_dasar, master_konversi.kode_item_dasar),
    -- Jika di-upload dari CSV, timpa prioritas utamanya
    faktor_konversi = case 
                        when EXCLUDED.faktor_konversi IS NOT NULL AND EXCLUDED.faktor_konversi <> 1 then EXCLUDED.faktor_konversi 
                        else coalesce(master_konversi.faktor_konversi, 1) 
                      end;

  return jsonb_build_object(
    'inserted_headers', v_inserted_headers,
    'inserted_details', v_inserted_details
  );
end;
$$;
