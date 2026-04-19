-- 0) Pastikan kolom user_id di tabel members bersifat UNIQUE
-- Agar tabel projects bisa menetapkannya sebagai Foreign Key (SQL Error 42830)
alter table public.members add constraint members_user_id_key unique (user_id);

-- 0.5) Pastikan function is_app_admin() tersedia di environment Anda agar RLS tidak error
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

-- 1) Re-create Struktur tabel projects (sudah digabung dengan kolom identitas terbaru)
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  program_name text,
  activity_name text,
  work_name text,
  location text,
  fiscal_year text,
  contract_number text,
  user_id uuid references public.members (user_id) on delete cascade,
  created_by uuid references public.members (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Update owner fallback jika user_id kosong
update public.projects
set user_id = created_by
where user_id is null and created_by is not null;

create index if not exists idx_projects_user_id on public.projects (user_id);

-- 3) Enable Row Level Security (RLS) pada tabel projects
alter table public.projects enable row level security;

-- 4) Trigger: Pembuat proyek otomatis masuk project_members
create or replace function public.projects_after_insert_add_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  owner_id := coalesce(new.user_id, new.created_by);
  if owner_id is not null and to_regclass('public.project_members') is not null then
    insert into public.project_members (project_id, user_id, can_write)
    values (new.id, owner_id, true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_after_insert_creator on public.projects;
create trigger projects_after_insert_creator
  after insert on public.projects
  for each row execute function public.projects_after_insert_add_creator();

-- 5) RLS Policies untuk Projects
drop policy if exists projects_insert_pro_admin_owner on public.projects;
drop policy if exists projects_delete_owner_or_admin on public.projects;

create policy projects_insert_pro_admin_owner
  on public.projects for insert
  to authenticated
  with check (
    public.is_app_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.members m
        where m.user_id = auth.uid()
          and m.role in ('admin', 'pro')
      )
    )
  );

create policy projects_delete_owner_or_admin
  on public.projects for delete
  to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
  );

-- Opsional: Read policy untuk projects jika aplikasimu juga butuh (bisa disesuaikan)
drop policy if exists projects_select_owner_or_admin on public.projects;
create policy projects_select_owner_or_admin
  on public.projects for select
  to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
  );

drop policy if exists projects_update_owner_or_admin on public.projects;
create policy projects_update_owner_or_admin
  on public.projects for update
  to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
  )
  with check (
    public.is_app_admin()
    or user_id = auth.uid()
  );

-- 6) Reload Schema Cache
NOTIFY pgrst, 'reload schema';
