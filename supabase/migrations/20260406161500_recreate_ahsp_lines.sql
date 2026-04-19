-- Memulihkan tabel ahsp_lines yang terhapus
-- karena terpengaruh DROP CASCADE dari tabel projects

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.ahsp_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sort_order integer not null default 0,
  bab_pekerjaan text default 'Tanpa Kategori',
  uraian text,
  uraian_custom text,
  satuan text,
  volume numeric(20, 6) not null default 0,
  harga_satuan numeric(20, 2) not null default 0,
  jumlah numeric(20, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ahsp_lines_project on public.ahsp_lines (project_id);

create trigger ahsp_lines_updated_at
  before update on public.ahsp_lines
  for each row execute function public.set_updated_at();

alter table public.ahsp_lines enable row level security;

create policy ahsp_lines_select_if_project_readable
  on public.ahsp_lines for select
  to authenticated
  using (public.member_can_read_project(project_id));

create policy ahsp_lines_insert_if_project_writable
  on public.ahsp_lines for insert
  to authenticated
  with check (public.member_can_write_project(project_id));

create policy ahsp_lines_update_if_project_writable
  on public.ahsp_lines for update
  to authenticated
  using (public.member_can_write_project(project_id))
  with check (public.member_can_write_project(project_id));

create policy ahsp_lines_delete_if_project_writable
  on public.ahsp_lines for delete
  to authenticated
  using (public.member_can_write_project(project_id));

NOTIFY pgrst, 'reload schema';
