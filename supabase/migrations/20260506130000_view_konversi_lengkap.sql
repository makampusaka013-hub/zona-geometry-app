-- Migration: view_konversi_lengkap
-- Tujuan: Mempermudah filtering data di halaman Admin Konversi dengan flag terpakai, terhubung, dan beda satuan.

drop view if exists public.view_konversi_lengkap;

create or replace view public.view_konversi_lengkap as
with ahsp_usage as (
    select distinct uraian_ahsp, satuan_uraian
    from public.master_ahsp_details
)
select 
    mk.*,
    (u.uraian_ahsp is not null) as is_terpakai_ahsp,
    (mk.item_dasar_id is not null) as is_mapped,
    case 
        when mk.item_dasar_id is not null and mhd.satuan is not null 
        then (mk.satuan_ahsp <> mhd.satuan)
        else false 
    end as is_beda_satuan,
    mhd.nama_item as master_nama_item,
    mhd.satuan as master_satuan,
    mhd.harga_satuan as master_harga_satuan,
    mhd.kode_item as master_kode_item
from public.master_konversi mk
left join ahsp_usage u on u.uraian_ahsp = mk.uraian_ahsp and u.satuan_uraian = mk.satuan_ahsp
left join public.master_harga_dasar mhd on mhd.id = mk.item_dasar_id;

grant select on public.view_konversi_lengkap to authenticated;
