create or replace function update_global_profit(p_profit numeric)
returns void language plpgsql security definer as $$
begin
  update master_ahsp
  set overhead_profit = p_profit
  where id is not null;
end;
$$;
