-- Proyek dimiliki langsung oleh members (user_id), tanpa tabel workspaces.
-- Jalankan di Supabase SQL Editor jika error schema cache / tidak ada workspaces.

-- -----------------------------------------------------------------------------
-- 1) Struktur tabel projects
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  user_id uuid references public.members (user_id) on delete cascade,
  created_by uuid references public.members (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists user_id uuid references public.members (user_id) on delete cascade;
alter table public.projects add column if not exists created_by uuid references public.members (user_id) on delete set null;

alter table public.projects drop constraint if exists projects_workspace_id_fkey;
alter table public.projects drop column if exists workspace_id;

update public.projects
set user_id = created_by
where user_id is null and created_by is not null;

create index if not exists idx_projects_user_id on public.projects (user_id);

-- -----------------------------------------------------------------------------
-- 2) Trigger: pembuat proyek masuk project_members (pakai user_id atau created_by)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 3) RLS helpers tanpa workspace_members / workspaces
-- -----------------------------------------------------------------------------

create or replace function public.member_can_write_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.projects p
      join public.members mem on mem.user_id = auth.uid()
      where p.id = p_project_id
        and p.user_id = auth.uid()
        and mem.role in ('admin', 'pro')
    )
    or coalesce(
      (
        select pm.can_write and mem.role <> 'view'
        from public.project_members pm
        join public.members mem on mem.user_id = pm.user_id
        where pm.project_id = p_project_id
          and pm.user_id = auth.uid()
      ),
      false
    );
$$;

create or replace function public.member_can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.user_id = auth.uid()
    );
$$;

create or replace function public.member_is_workspace_pro_or_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.role in ('admin', 'pro')
    );
$$;

-- -----------------------------------------------------------------------------
-- 4) Policies projects (tanpa workspace_id)
-- -----------------------------------------------------------------------------

drop policy if exists projects_insert_workspace_pro on public.projects;
drop policy if exists projects_delete_workspace_pro on public.projects;
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

-- -----------------------------------------------------------------------------
-- 5) Policies project_members (owner proyek atau admin), jika tabel ada
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.project_members') is not null then
    execute 'drop policy if exists project_members_manage_by_pro_admin on public.project_members';
    execute 'drop policy if exists project_members_update_by_pro_admin on public.project_members';
    execute 'drop policy if exists project_members_delete_by_pro_admin on public.project_members';
    execute $pol$
      create policy project_members_manage_by_owner_or_admin
        on public.project_members for insert
        to authenticated
        with check (
          public.is_app_admin()
          or exists (
            select 1
            from public.projects p
            where p.id = project_id
              and p.user_id = auth.uid()
          )
        )
    $pol$;
    execute $pol$
      create policy project_members_update_by_owner_or_admin
        on public.project_members for update
        to authenticated
        using (
          public.is_app_admin()
          or exists (
            select 1
            from public.projects p
            where p.id = project_id
              and p.user_id = auth.uid()
          )
        )
        with check (
          public.is_app_admin()
          or exists (
            select 1
            from public.projects p
            where p.id = project_id
              and p.user_id = auth.uid()
          )
        )
    $pol$;
    execute $pol$
      create policy project_members_delete_by_owner_or_admin
        on public.project_members for delete
        to authenticated
        using (
          public.is_app_admin()
          or exists (
            select 1
            from public.projects p
            where p.id = project_id
              and p.user_id = auth.uid()
          )
        )
    $pol$;
  end if;
end $$;
