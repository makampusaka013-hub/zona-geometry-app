-- Migration: view_konversi_lengkap (Refined Filters)
-- Tujuan: Menyesuaikan definisi "Sudah Konversi" sesuai permintaan user (Beda Satuan + Faktor bukan 1).

drop view if exists public.view_konversi_lengkap;

create or replace view public.view_konversi_lengkap 
with (security_invoker = true)
as
with ahsp_usage as (
    select distinct uraian_ahsp, satuan_uraian
    from public.master_ahsp_details
)
select 
    mk.*,
    (u.uraian_ahsp is not null) as is_terpakai_ahsp,
    (mk.item_dasar_id is not null) as is_mapped,
    -- Indikator umum beda satuan
    case 
        when mk.item_dasar_id is not null and mhd.satuan is not null 
        then (mk.satuan_ahsp <> mhd.satuan)
        else false 
    end as has_unit_mismatch,
    -- Filter "Beda Satuan" (Urgent: Beda Satuan tapi Faktor masih 1)
    case 
        when mk.item_dasar_id is not null and mhd.satuan is not null 
        then (mk.satuan_ahsp <> mhd.satuan) and (mk.faktor_konversi = 1)
        else false 
    end as is_beda_satuan_urgent,
    -- Filter "Sudah Konversi" (Selesai: Beda Satuan dan Faktor SUDAH diubah/bukan 1)
    case 
        when mk.item_dasar_id is not null and mhd.satuan is not null 
        then (mk.satuan_ahsp <> mhd.satuan) and (mk.faktor_konversi <> 1)
        else false 
    end as is_konversi_done,
    mhd.nama_item as master_nama_item,
    mhd.satuan as master_satuan,
    mhd.harga_satuan as master_harga_satuan,
    mhd.kode_item as master_kode_item
from public.master_konversi mk
left join ahsp_usage u on lower(trim(u.uraian_ahsp)) = lower(trim(mk.uraian_ahsp)) 
                       and lower(trim(u.satuan_uraian)) = lower(trim(mk.satuan_ahsp))
left join public.master_harga_dasar mhd on mhd.id = mk.item_dasar_id;

grant select on public.view_konversi_lengkap to authenticated;
