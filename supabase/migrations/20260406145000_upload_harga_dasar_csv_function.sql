-- Upload Harga Bahan Dasar (CSV) ke master_harga_dasar
-- Function ini bersifat atomic: error pada satu baris akan menggagalkan seluruh proses.

create or replace function public.upload_harga_dasar_csv(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;

  v_no_urut integer;
  v_nama_item text;
  v_kode_item text;
  v_satuan text;
  v_harga_satuan numeric;
  v_keterangan text;
  v_tkdn_persen numeric;
  v_status text;

  v_updated int := 0;
  v_inserted int := 0;
begin
  -- Only admin can upload/update/delete
  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'admin'
  ) then
    raise exception 'Forbidden: only admin can upload master_harga_dasar CSV';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid input: p_rows must be a JSON array';
  end if;

  for v_row in
    select value
    from jsonb_array_elements(p_rows) as t(value)
  loop
    v_no_urut := nullif(trim(v_row->>'no_urut'), '')::integer;
    v_nama_item := nullif(trim(v_row->>'nama_item'), '');
    v_kode_item := nullif(trim(v_row->>'kode_item'), '');
    v_satuan := nullif(trim(v_row->>'satuan'), '');
    v_harga_satuan := nullif(trim(v_row->>'harga_satuan'), '')::numeric;
    v_keterangan := nullif(trim(v_row->>'keterangan'), '');
    v_tkdn_persen := nullif(trim(v_row->>'tkdn_persen'), '')::numeric;
    v_status := nullif(trim(v_row->>'status'), '');

    if v_kode_item is null then
      raise exception 'Row missing kode_item';
    end if;
    if v_harga_satuan is null then
      raise exception 'Row missing harga_satuan for kode_item=%', v_kode_item;
    end if;

    -- Update if exists, otherwise insert
    if exists (select 1 from public.master_harga_dasar m where m.kode_item = v_kode_item) then
      update public.master_harga_dasar
      set
        no_urut = coalesce(v_no_urut, no_urut),
        nama_item = coalesce(v_nama_item, nama_item),
        satuan = coalesce(v_satuan, satuan),
        harga_satuan = v_harga_satuan,
        keterangan = coalesce(v_keterangan, keterangan),
        tkdn_persen = coalesce(v_tkdn_persen, tkdn_persen),
        status = coalesce(v_status, status)
      where kode_item = v_kode_item;

      v_updated := v_updated + 1;
    else
      insert into public.master_harga_dasar (
        no_urut,
        nama_item,
        kode_item,
        satuan,
        harga_satuan,
        keterangan,
        tkdn_persen,
        status
      ) values (
        v_no_urut,
        v_nama_item,
        v_kode_item,
        v_satuan,
        v_harga_satuan,
        v_keterangan,
        v_tkdn_persen,
        v_status
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'updated_rows', v_updated,
    'inserted_rows', v_inserted
  );
end;
$$;

revoke all on function public.upload_harga_dasar_csv(jsonb) from public;
grant execute on function public.upload_harga_dasar_csv(jsonb) to authenticated;

