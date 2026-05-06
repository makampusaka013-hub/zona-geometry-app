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
  -- Masukkan semua item UNIK dari rincian AHSP yang pernah diupload
  -- Gunakan DISTINCT ON agar (uraian_ahsp, satuan_uraian) yang sama tidak duplikat
  insert into public.master_konversi (uraian_ahsp, satuan_ahsp, faktor_konversi)
  select distinct on (uraian_ahsp, satuan_uraian)
    uraian_ahsp, 
    satuan_uraian, 
    1
  from public.master_ahsp_details
  where uraian_ahsp is not null
  on conflict (uraian_ahsp, satuan_ahsp) 
  do nothing; -- Jika sudah ada, biarkan saja (jangan timpa mapping yang sudah dibuat)

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
