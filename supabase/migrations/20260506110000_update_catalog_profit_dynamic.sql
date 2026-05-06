-- Migration: Secure Global Profit Functions
-- Tujuan: Memperbaiki peringatan linter terkait search_path dan hak eksekusi anonim.

-- 1. Perbaiki get_global_profit
drop function if exists public.get_global_profit();
create or replace function public.get_global_profit()
returns numeric
language sql
security definer
set search_path = public -- FIX: Search Path Security
stable
as $$
  select value::numeric from public.global_settings where key = 'default_overhead_profit';
$$;

-- 2. Perbaiki update_global_profit
drop function if exists public.update_global_profit(numeric);
create or replace function public.update_global_profit(p_profit numeric)
returns jsonb
language plpgsql
security definer
set search_path = public -- FIX: Search Path Security
as $$
begin
  if not exists (
    select 1 from public.members m 
    where m.user_id = auth.uid() and m.role = 'admin'
  ) then
    raise exception 'Forbidden: Only admin can change global profit';
  end if;

  update public.global_settings 
  set value = p_profit::text, updated_at = now()
  where key = 'default_overhead_profit';

  -- Sync ke master_ahsp
  update public.master_ahsp set overhead_profit = p_profit;

  return jsonb_build_object('success', true, 'new_profit', p_profit);
end;
$$;

-- FIX: Hak Eksekusi (Hanya Authenticated, Bukan Anon)
revoke execute on function public.get_global_profit() from public, anon;
grant execute on function public.get_global_profit() to authenticated;

revoke execute on function public.update_global_profit(numeric) from public, anon;
grant execute on function public.update_global_profit(numeric) to authenticated;
