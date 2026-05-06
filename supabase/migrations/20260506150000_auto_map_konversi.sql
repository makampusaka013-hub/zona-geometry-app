-- Migration: auto_map_konversi
-- Tujuan: Secara otomatis menghubungkan AHSP ke Katalog jika Nama dan Satuannya sama persis.

create or replace function public.auto_map_konversi()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  -- Update item yang belum terhubung (item_dasar_id IS NULL)
  -- Cari kecocokan Nama dan Satuan (Case-Insensitive)
  update public.master_konversi mk
  set 
    item_dasar_id = mhd.id,
    faktor_konversi = 1,
    kode_item_dasar = mhd.kode_item
  from public.master_harga_dasar mhd
  where mk.item_dasar_id is null
    and lower(trim(mk.uraian_ahsp)) = lower(trim(mhd.nama_item))
    and lower(trim(mk.satuan_ahsp)) = lower(trim(mhd.satuan));

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'success', true,
    'mapped_count', v_count
  );
end;
$$;

-- Berikan izin akses
revoke execute on function public.auto_map_konversi() from public, anon;
grant execute on function public.auto_map_konversi() to authenticated;
