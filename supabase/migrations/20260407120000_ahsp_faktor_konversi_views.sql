-- Konversi harga toko (satuan beli) ke satuan uraian AHSP:
-- harga_satuan_uraian = harga_toko / faktor_konversi
-- subtotal baris = harga_satuan_uraian * koefisien
--
-- + Kolom baru di master_ahsp_details
-- + Recreate view_analisa_ahsp & view_debug_analisa
-- + Perbaikan total_hsp_akhir_for_master_ahsp agar overhead = persen

alter table public.master_ahsp
  add column if not exists overhead_profit numeric default 15;

alter table public.master_ahsp_details
  add column if not exists faktor_konversi numeric default 1,
  add column if not exists satuan_uraian text;

update public.master_ahsp_details
set faktor_konversi = 1
where faktor_konversi is null or faktor_konversi = 0;

comment on column public.master_ahsp_details.faktor_konversi is 'Pembagi harga toko ke satuan uraian (contoh: 40 untuk semen per sak 40 kg).';
comment on column public.master_ahsp_details.satuan_uraian is 'Satuan pekerjaan uraian (contoh: kg).';

-- Dependensi view: drop lalu buat ulang
drop view if exists public.view_debug_analisa;
drop view if exists public.view_analisa_ahsp;

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
    coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric) as faktor_efektif,
    mad.satuan_uraian,
    mhd.harga_satuan as harga_toko,
    mhd.kode_item,
    mhd.nama_item,
    (mhd.harga_satuan / coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal,
    case
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'L' then 'upah'
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) in ('A', 'B') then 'bahan'
      when upper(substring(trim(coalesce(mhd.kode_item, '')), 1, 1)) = 'M' then 'alat'
      else 'lainnya'
    end as jenis_komponen
  from public.master_ahsp ma
  join public.master_ahsp_details mad on mad.master_ahsp_id = ma.id
  join public.master_harga_dasar mhd on mhd.id = mad.master_harga_dasar_id
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
  mhd.nama_item as nama_komponen,
  mhd.kode_item as kode_komponen,
  mad.koefisien,
  coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric) as faktor_konversi,
  mad.satuan_uraian,
  mhd.harga_satuan as harga_toko,
  (mhd.harga_satuan / coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric)) as harga_dasar,
  (mhd.harga_satuan / coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal_item,
  (mhd.harga_satuan / coalesce(nullif(mad.faktor_konversi, 0::numeric), 1::numeric)) * mad.koefisien as subtotal,
  coalesce(ma.overhead_profit, 15::numeric) as overhead_profit
from public.master_ahsp ma
join public.master_ahsp_details mad on mad.master_ahsp_id = ma.id
join public.master_harga_dasar mhd on mhd.id = mad.master_harga_dasar_id;

-- HSP akhir = total_subtotal * (1 + overhead%/100)
create or replace function public.total_hsp_akhir_for_master_ahsp(p_master_ahsp_id uuid)
returns numeric
language sql
stable
as $$
  select
    coalesce(max(v.total_subtotal), 0::numeric)
    * (1::numeric + coalesce(max(v.overhead_profit), 0::numeric) / 100::numeric)
  from public.view_analisa_ahsp v
  where v.master_ahsp_id = p_master_ahsp_id;
$$;

-- Upload CSV: simpan faktor_konversi & satuan_uraian per baris detail
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
  v_kode_item_dasar text;
  v_koefisien numeric;
  v_satuan_pekerjaan text;
  v_faktor_konversi numeric;
  v_satuan_uraian text;
  v_faktor_raw text;

  v_master_ahsp_id uuid;
  v_master_harga_dasar_id uuid;

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
    v_kode_item_dasar := nullif(trim(v_row->>'kode_item_dasar'), '');
    v_koefisien := nullif(replace(trim(v_row->>'koefisien'), ',', '.'), '')::numeric;
    v_satuan_pekerjaan := nullif(trim(v_row->>'satuan_pekerjaan'), '');

    v_faktor_raw := nullif(trim(v_row->>'faktor_konversi'), '');
    if v_faktor_raw is null or v_faktor_raw = '' then
      v_faktor_konversi := 1;
    else
      v_faktor_konversi := replace(v_faktor_raw, ',', '.')::numeric;
    end if;
    if v_faktor_konversi is null or v_faktor_konversi = 0 then
      v_faktor_konversi := 1;
    end if;

    v_satuan_uraian := nullif(trim(v_row->>'satuan_uraian'), '');

    if v_kode_ahsp is null then
      raise exception 'Row missing kode_ahsp';
    end if;
    if v_kode_item_dasar is null then
      raise exception 'Row missing kode_item_dasar';
    end if;
    if v_koefisien is null then
      raise exception 'Row missing koefisien';
    end if;

    select id into v_master_ahsp_id
    from public.master_ahsp
    where kode_ahsp = v_kode_ahsp
    limit 1;

    if v_master_ahsp_id is not null then
      update public.master_ahsp
      set divisi = coalesce(v_divisi, divisi)
      where id = v_master_ahsp_id;
    end if;

    if v_master_ahsp_id is null then
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

          if v_master_ahsp_id is null then
            raise exception 'Failed to create/find master_ahsp for kode_ahsp=%', v_kode_ahsp;
          end if;

          update public.master_ahsp
          set divisi = coalesce(v_divisi, divisi)
          where id = v_master_ahsp_id;
      end;
    end if;

    select id into v_master_harga_dasar_id
    from public.master_harga_dasar
    where kode_item_dasar = v_kode_item_dasar
       or kode_item = v_kode_item_dasar
    limit 1;

    if v_master_harga_dasar_id is null then
      raise exception 'master_harga_dasar not found for kode_item_dasar=%', v_kode_item_dasar;
    end if;

    insert into public.master_ahsp_details (
      master_ahsp_id,
      master_harga_dasar_id,
      koefisien,
      faktor_konversi,
      satuan_uraian
    )
    values (
      v_master_ahsp_id,
      v_master_harga_dasar_id,
      v_koefisien,
      v_faktor_konversi,
      v_satuan_uraian
    );

    v_inserted_details := v_inserted_details + 1;
  end loop;

  return jsonb_build_object(
    'inserted_headers', v_inserted_headers,
    'inserted_details', v_inserted_details
  );
end;
$$;

revoke all on function public.upload_ahsp_csv(jsonb) from public;
grant execute on function public.upload_ahsp_csv(jsonb) to authenticated;
