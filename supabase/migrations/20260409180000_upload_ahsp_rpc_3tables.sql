-- File: supabase/migrations/20260409180000_upload_ahsp_rpc_3tables.sql
-- Tujuan: Menjadikan upload AHSP menembak 3 tabel utama secara pasti & kebal error (*Bulletproof*) sesuai skenario "Opsi 2".
-- Tabel Sasaran:
-- 1. public.master_ahsp (Data Pekerjaan AHSP utama)
-- 2. public.master_ahsp_details (Data Rincian Komponen / Koefisien / Satuan / Faktor CSV)
-- 3. public.master_konversi (Data Library Mapping Satuan & Konversinya)

-- Pastikan master_ahsp_details telah mendukung kolom faktor_konversi
ALTER TABLE public.master_ahsp_details ADD COLUMN IF NOT EXISTS faktor_konversi numeric default 1;

-- Fungsi RPC Utama
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

  -- BACA DATA BARIS DEMI BARIS
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
    
    -- Parsing Numeric yang aman (kebal error koma/titik)
    begin
        v_koefisien := (nullif(replace(trim(v_row->>'koefisien'), ',', '.'), ''))::numeric;
    exception when others then v_koefisien := 0; end;

    begin
        v_konversi := (nullif(replace(trim(v_row->>'konversi'), ',', '.'), ''))::numeric;
    exception when others then v_konversi := 1; end;

    -- Standarisasi null satuan menjadi strip '-' agar constraint unik SQL tidak jebol.
    v_satuan_pekerjaan := coalesce(nullif(trim(v_row->>'satuan_pekerjaan'), ''), '-');
    v_satuan_uraian := coalesce(nullif(trim(v_row->>'satuan_uraian'), ''), '-');

    if v_kode_ahsp is null then raise exception 'Row missing kode_ahsp'; end if;
    if v_uraian_ahsp is null then raise exception 'Row missing uraian_ahsp'; end if;

    -- =========================================================================
    -- [TABEL 1] MASTER AHSP (Header)
    -- =========================================================================
    select id into v_master_ahsp_id from public.master_ahsp where kode_ahsp = v_kode_ahsp limit 1;

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
            jenis_pekerjaan, kategori_pekerjaan, kode_ahsp, nama_pekerjaan, satuan_pekerjaan, divisi
        )
        values (
            v_jenis_pekerjaan, v_kategori_pekerjaan, v_kode_ahsp, v_nama_pekerjaan, v_satuan_pekerjaan, v_divisi
        )
        returning id into v_master_ahsp_id;
        v_inserted_headers := v_inserted_headers + 1;
      exception
        when unique_violation then
          -- Fallback jika race condition
          select id into v_master_ahsp_id from public.master_ahsp where kode_ahsp = v_kode_ahsp limit 1;
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

    -- =========================================================================
    -- [TABEL 2] MASTER AHSP DETAILS (Detail Uraian & Koefisien)
    -- =========================================================================
    insert into public.master_ahsp_details (
        ahsp_id, 
        uraian_ahsp, 
        koefisien, 
        satuan_uraian, 
        kode_item_dasar, 
        faktor_konversi
    )
    values (
        v_master_ahsp_id, 
        v_uraian_ahsp, 
        v_koefisien, 
        v_satuan_uraian, 
        v_kode_item_dasar, 
        coalesce(v_konversi, 1)
    );

    v_inserted_details := v_inserted_details + 1;
  end loop;

  -- =========================================================================
  -- [TABEL 3] MASTER KONVERSI (Kamus Sentral Hubungan Uraian - Satuan - Harga Dasar)
  -- =========================================================================
  with mk_ins as (
    select distinct 
      val->>'uraian_ahsp' as u_ahsp, 
      coalesce(nullif(trim(val->>'satuan_uraian'), ''), '-') as s_uraian,
      nullif(trim(val->>'kode_item_dasar'), '') as k_item,
      -- Pembersihan string numeric
      coalesce( nullif(regexp_replace(trim(val->>'konversi'), '[^0-9\.\,-]', '', 'g'), ''), '1' ) as f_raw
    from jsonb_array_elements(p_rows) as t(val)
    where val->>'uraian_ahsp' is not null
  )
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp, kode_item_dasar, faktor_konversi, item_dasar_id)
  select 
     m.u_ahsp, 
     m.s_uraian, 
     m.k_item, 
     coalesce(nullif(replace(m.f_raw, ',', '.'), '')::numeric, 1),
     -- Lookup cross-check langsung menyerap UUID jika kode_item tersedia
     (select id from public.master_harga_dasar mhd where mhd.kode_item = m.k_item or mhd.kode_item_dasar = m.k_item limit 1) as i_dasar_id
  from mk_ins m
  on conflict (uraian_ahsp, satuan_ahsp) 
  do update set 
    kode_item_dasar = coalesce(EXCLUDED.kode_item_dasar, master_konversi.kode_item_dasar),
    faktor_konversi = coalesce(EXCLUDED.faktor_konversi, master_konversi.faktor_konversi, 1),
    item_dasar_id = coalesce(EXCLUDED.item_dasar_id, master_konversi.item_dasar_id);

  return jsonb_build_object(
    'inserted_headers', v_inserted_headers,
    'inserted_details', v_inserted_details
  );
end;
$$;

revoke all on function public.upload_ahsp_csv(jsonb) from public;
grant execute on function public.upload_ahsp_csv(jsonb) to authenticated;
