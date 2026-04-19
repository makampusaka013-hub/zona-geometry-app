-- 1. Create master_konversi
create table if not exists public.master_konversi (
  id uuid primary key default gen_random_uuid(),
  uraian_ahsp text not null,
  satuan_ahsp text,
  item_dasar_id uuid references public.master_harga_dasar (id) on delete set null,
  faktor_konversi numeric default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_uraian_satuan_konversi unique (uraian_ahsp, satuan_ahsp)
);

create or replace function public.set_master_konversi_updated_at()
returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create trigger master_konversi_updated_at
before update on public.master_konversi
for each row execute function public.set_master_konversi_updated_at();

-- RLS untuk master_konversi
alter table public.master_konversi enable row level security;
create policy select_master_konversi on public.master_konversi for select to authenticated using (true);
create policy insert_master_konversi on public.master_konversi for insert to authenticated with check ( public.is_app_admin() );
create policy update_master_konversi on public.master_konversi for update to authenticated using ( public.is_app_admin() );
create policy delete_master_konversi on public.master_konversi for delete to authenticated using ( public.is_app_admin() );

-- 2. Modifikasi master_ahsp_details (User verified table is already reset)

-- 3. Update view_analisa_ahsp & view_debug_analisa
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

-- 4. Update function upload_ahsp_csv
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

    -- DETAIL insert (NO harga_dasar check!)
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

  -- 5. Insert to master_konversi unique values ON CONFLICT DO NOTHING
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp)
  select distinct uraian_ahsp, satuan_uraian
  from public.master_ahsp_details
  where uraian_ahsp is not null
  on conflict (uraian_ahsp, satuan_ahsp) do nothing;

  return jsonb_build_object(
    'inserted_headers', v_inserted_headers,
    'inserted_details', v_inserted_details
  );
end;
$$;
