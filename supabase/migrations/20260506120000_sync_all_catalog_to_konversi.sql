-- Migration: sync_all_catalog_to_konversi (Security Hardened)
-- Tujuan: Memperbaiki peringatan linter terkait search_path dan hak eksekusi anonim.

drop function if exists public.sync_all_catalog_to_konversi();
create or replace function public.sync_all_catalog_to_konversi()
returns jsonb
language plpgsql
security definer
set search_path = public -- FIX: Search Path Security
as $$
declare
  v_count int := 0;
begin
  -- 1. Tarik semua item UNIK dari AHSP
  -- 2. Sekaligus hubungkan (Mapping) otomatis jika Nama & Satuan sama persis dengan Katalog
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp, item_dasar_id, faktor_konversi, kode_item_dasar)
  select distinct on (mad.uraian_ahsp, mad.satuan_uraian)
    mad.uraian_ahsp, 
    mad.satuan_uraian, 
    mhd.id, -- Hubungkan otomatis jika ketemu di katalog
    1, 
    mhd.kode_item
  from public.master_ahsp_details mad
  left join public.master_harga_dasar mhd on 
    lower(trim(mhd.nama_item)) = lower(trim(mad.uraian_ahsp)) 
    and lower(trim(mhd.satuan)) = lower(trim(mad.satuan_uraian))
  where mad.uraian_ahsp is not null
  on conflict (uraian_ahsp, satuan_ahsp) 
  do update set 
    item_dasar_id = coalesce(master_konversi.item_dasar_id, EXCLUDED.item_dasar_id),
    kode_item_dasar = coalesce(master_konversi.kode_item_dasar, EXCLUDED.kode_item_dasar);

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'success', true,
    'synced_count', v_count
  );
end;
$$;

-- FIX: Hak Eksekusi
revoke execute on function public.sync_all_catalog_to_konversi() from public, anon;
grant execute on function public.sync_all_catalog_to_konversi() to authenticated;
