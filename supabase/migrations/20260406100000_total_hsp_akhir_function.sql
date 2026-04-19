-- Fungsi Total Otomatis: HSP akhir = jumlah subtotal per jenis_komponen + overhead_profit
-- Sumber subtotal/overhead mengikuti `view_analisa_ahsp`.

create or replace function public.total_hsp_akhir_for_master_ahsp(p_master_ahsp_id uuid)
returns numeric
language sql
stable
as $$
  select
    coalesce(
      sum(
        case
          when lower(coalesce(jenis_komponen::text, '')) like '%upah%' then coalesce(subtotal, 0)
          when lower(coalesce(jenis_komponen::text, '')) like '%bahan%' then coalesce(subtotal, 0)
          when lower(coalesce(jenis_komponen::text, '')) like '%alat%'  then coalesce(subtotal, 0)
          else coalesce(subtotal, 0)
        end
      ),
      0
    )
    + coalesce(max(overhead_profit), 0)
  from public.view_analisa_ahsp
  where master_ahsp_id = p_master_ahsp_id;
$$;

