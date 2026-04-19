-- Migration File: Updates Konversi Logic
-- 1. Add kode_item_dasar to master_konversi
ALTER TABLE public.master_konversi ADD COLUMN IF NOT EXISTS kode_item_dasar text;

-- 2. Modify upload_ahsp_csv to natively handle 'konversi'
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
    v_satuan_pekerjaan := nullif(trim(v_row->>'satuan_pekerjaan'), '');
    v_satuan_uraian := nullif(trim(v_row->>'satuan_uraian'), '');
    
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
      val->>'satuan_uraian' as s_uraian,
      val->>'kode_item_dasar' as k_item,
      nullif(replace(trim(val->>'konversi'), ',', '.'), '')::numeric as f_konv
    from jsonb_array_elements(p_rows) as t(val)
    where val->>'uraian_ahsp' is not null
  )
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp, kode_item_dasar, faktor_konversi)
  select u_ahsp, s_uraian, k_item, f_konv
  from mk_ins
  on conflict (uraian_ahsp, satuan_ahsp) 
  do update set 
    kode_item_dasar = coalesce(EXCLUDED.kode_item_dasar, master_konversi.kode_item_dasar),
    faktor_konversi = coalesce(EXCLUDED.faktor_konversi, master_konversi.faktor_konversi);

  return jsonb_build_object(
    'inserted_headers', v_inserted_headers,
    'inserted_details', v_inserted_details
  );
end;
$$;

-- 3. Replace sync_master_konversi to intelligently link item_dasar_id using kode_item_dasar
create or replace function public.sync_master_konversi()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'admin'
  ) then
    raise exception 'Forbidden: only admin can sync';
  end if;

  -- Fill in missing item_dasar_id from kode_item_dasar mapping
  with mapped as (
    select mk.id, mhd.id as new_item_dasar_id
    from public.master_konversi mk
    join public.master_harga_dasar mhd on mhd.kode_item = mk.kode_item_dasar
    where mk.item_dasar_id is null and mk.kode_item_dasar is not null
  )
  update public.master_konversi mk
  set item_dasar_id = m.new_item_dasar_id
  from mapped m
  where mk.id = m.id;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'inserted', v_updated,
    'message', 'Konversi mapping UUID updated'
  );
end;
$$;


-- 4. Update view_analisa_ahsp to use MULTIPLICATION instead of division
drop view if exists public.view_debug_analisa cascade;
drop view if exists public.view_analisa_ahsp cascade;

create or replace view public.view_analisa_ahsp as
with detail_calc as (
  select
    ma.id as master_ahsp_id,
    ma.id as ahsp_id,
    ma.kode_ahsp,
    ma.nama_pekerjaan,
    ma.divisi,
    ma.satuan_pekerjaan as satuan_pekerjaan,
    coalesce(ma.overhead_profit, 15::numeric) as overhead_profit,
    mad.koefisien,
    coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric) as faktor_efektif,
    mad.satuan_uraian,
    mhd.harga_satuan as harga_toko,
    mhd.kode_item,
    mhd.nama_item,
    (coalesce(mhd.harga_satuan, 0) / coalesce(nullif(mk.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal,
    case
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' then 'upah'
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) in ('A', 'B') then 'bahan'
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'M' then 'alat'
      else 'lainnya'
    end as jenis_komponen
  from public.master_ahsp ma
  join public.master_ahsp_details mad on mad.ahsp_id = ma.id
  left join public.master_konversi mk on mk.uraian_ahsp = mad.uraian_ahsp and (mk.satuan_ahsp is not distinct from mad.satuan_uraian)
  left join public.master_harga_dasar mhd on mhd.id = mk.item_dasar_id
)
select
  master_ahsp_id,
  ahsp_id,
  kode_ahsp,
  nama_pekerjaan,
  divisi,
  max(satuan_pekerjaan) as satuan,
  max(satuan_pekerjaan) as satuan_pekerjaan,
  max(overhead_profit) as overhead_profit,
  sum(case when jenis_komponen = 'upah' then subtotal else 0::numeric end) as total_upah,
  sum(case when jenis_komponen = 'bahan' then subtotal else 0::numeric end) as total_bahan,
  sum(case when jenis_komponen = 'alat' then subtotal else 0::numeric end) as total_alat,
  sum(subtotal) as total_subtotal
from detail_calc
group by master_ahsp_id, ahsp_id, kode_ahsp, nama_pekerjaan, divisi;

create or replace view public.view_debug_analisa as
select
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
from public.master_ahsp ma
join public.master_ahsp_details mad on mad.ahsp_id = ma.id
left join public.master_konversi mk on mk.uraian_ahsp = mad.uraian_ahsp and (mk.satuan_ahsp is not distinct from mad.satuan_uraian)
left join public.master_harga_dasar mhd on mhd.id = mk.item_dasar_id;

-- 5. Create new view_konversi_harga as requested
create or replace view public.view_konversi_harga as
select 
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
from public.master_konversi mk
left join public.master_harga_dasar mhd on mk.item_dasar_id = mhd.id;
