-- BuildCalc & Monitor — skema awal sesuai PRD (members, workspaces, projects, project_details)
-- + workspace_members & project_members untuk assignment Normal/View dan RLS per project_id

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------

create type public.member_role as enum ('admin', 'pro', 'normal', 'view');

-- -----------------------------------------------------------------------------
-- TABLES
-- -----------------------------------------------------------------------------

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.member_role not null default 'view',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.members is 'Profil per user; PK user_id = auth.users.id. Email hanya di Auth (PRD). Role default view.';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (user_id) on delete set null
);

comment on table public.workspaces is 'Tenant/organisasi; proyek berada di bawah workspace.';

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.members (user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

comment on table public.workspace_members is 'User yang tergabung dalam suatu workspace (akses proyek di workspace ini).';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (user_id) on delete set null
);

comment on table public.projects is 'Proyek konstruksi; data operasional terkunci pada project_id (RLS).';

create table public.project_details (
  project_id uuid primary key references public.projects (id) on delete cascade,
  -- Identitas (header laporan)
  program_name text,
  activity_name text,
  work_name text,
  location text,
  -- Kontrak
  contract_number text,
  contract_date date,
  contract_value numeric(20, 2),
  fiscal_year text,
  funding_source text,
  -- Waktu
  spmk_date date,
  duration_calendar_days integer,
  pho_date date,
  -- Stakeholder
  contractor_name text,
  supervising_consultant_name text,
  ppk_name text,
  ppk_nip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_details is 'Metadata administratif kontrak per proyek (PRD §2).';

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.members (user_id) on delete cascade,
  can_write boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.members (user_id) on delete set null,
  primary key (project_id, user_id)
);

comment on table public.project_members is 'Siapa saja yang mengakses proyek; View = can_write false. Normal ditugaskan ke proyek tertentu.';

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------

create index idx_projects_workspace_id on public.projects (workspace_id);
create index idx_project_members_user_id on public.project_members (user_id);
create index idx_workspace_members_user_id on public.workspace_members (user_id);

-- -----------------------------------------------------------------------------
-- UPDATED_AT
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger project_details_updated_at
  before update on public.project_details
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pendaftaran: paksa role view untuk insert mandiri (cegah manipulasi jadi admin/pro)
-- -----------------------------------------------------------------------------

create or replace function public.members_enforce_public_signup_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id = auth.uid() then
    new.role := 'view';
  end if;
  return new;
end;
$$;

create trigger members_enforce_signup_role
  before insert on public.members
  for each row execute function public.members_enforce_public_signup_role();

-- Pembuat workspace otomatis masuk workspace_members (hak akses proyek di workspace)
create or replace function public.workspaces_after_insert_add_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger workspaces_after_insert_creator
  after insert on public.workspaces
  for each row execute function public.workspaces_after_insert_add_creator();

-- Pembuat proyek otomatis masuk project_members (baca/tulis sesuai role)
create or replace function public.projects_after_insert_add_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, can_write)
    values (new.id, new.created_by, true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_after_insert_creator
  after insert on public.projects
  for each row execute function public.projects_after_insert_add_creator();

-- -----------------------------------------------------------------------------
-- Helper RLS (hindari rekursi policy pada members)
-- -----------------------------------------------------------------------------

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'admin' from public.members m where m.user_id = auth.uid()),
    false
  );
$$;

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
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      join public.members mem on mem.user_id = wm.user_id
      where p.id = p_project_id
        and wm.user_id = auth.uid()
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
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      join public.members m on m.user_id = wm.user_id
      where p.id = p_project_id
        and wm.user_id = auth.uid()
        and m.role in ('admin', 'pro')
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
      from public.workspace_members wm
      join public.members m on m.user_id = wm.user_id
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and m.role in ('admin', 'pro')
    );
$$;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.member_can_write_project(uuid) to authenticated;
grant execute on function public.member_can_read_project(uuid) to authenticated;
grant execute on function public.member_is_workspace_pro_or_admin(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_details enable row level security;
alter table public.project_members enable row level security;

-- members
create policy members_select_own_or_admin
  on public.members for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy members_insert_self
  on public.members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy members_update_own_or_admin
  on public.members for update
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin())
  with check (user_id = auth.uid() or public.is_app_admin());

-- workspaces
create policy workspaces_select_member_or_creator_or_admin
  on public.workspaces for select
  to authenticated
  using (
    public.is_app_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
    )
  );

create policy workspaces_insert_authenticated
  on public.workspaces for insert
  to authenticated
  with check (created_by = auth.uid());

create policy workspaces_update_pro_admin
  on public.workspaces for update
  to authenticated
  using (
    public.is_app_admin()
    or created_by = auth.uid()
    or public.member_is_workspace_pro_or_admin(id)
  )
  with check (
    public.is_app_admin()
    or created_by = auth.uid()
    or public.member_is_workspace_pro_or_admin(id)
  );

-- workspace_members
create policy workspace_members_select_visible
  on public.workspace_members for select
  to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
    or public.member_is_workspace_pro_or_admin(workspace_id)
  );

create policy workspace_members_insert_by_pro_admin
  on public.workspace_members for insert
  to authenticated
  with check (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(workspace_id)
  );

create policy workspace_members_delete_by_pro_admin
  on public.workspace_members for delete
  to authenticated
  using (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(workspace_id)
  );

-- projects
create policy projects_select_if_readable
  on public.projects for select
  to authenticated
  using (public.member_can_read_project(id));

create policy projects_insert_workspace_pro
  on public.projects for insert
  to authenticated
  with check (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(workspace_id)
  );

create policy projects_update_if_writable
  on public.projects for update
  to authenticated
  using (public.is_app_admin() or public.member_can_write_project(id))
  with check (public.is_app_admin() or public.member_can_write_project(id));

create policy projects_delete_workspace_pro
  on public.projects for delete
  to authenticated
  using (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(workspace_id)
  );

-- project_details
create policy project_details_select_if_project_readable
  on public.project_details for select
  to authenticated
  using (public.member_can_read_project(project_id));

create policy project_details_insert_if_project_writable
  on public.project_details for insert
  to authenticated
  with check (public.member_can_write_project(project_id));

create policy project_details_update_if_project_writable
  on public.project_details for update
  to authenticated
  using (public.member_can_write_project(project_id))
  with check (public.member_can_write_project(project_id));

create policy project_details_delete_if_project_writable
  on public.project_details for delete
  to authenticated
  using (public.member_can_write_project(project_id));

-- project_members
create policy project_members_select_if_visible
  on public.project_members for select
  to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
    or public.member_can_read_project(project_id)
  );

create policy project_members_manage_by_pro_admin
  on public.project_members for insert
  to authenticated
  with check (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(
      (select p.workspace_id from public.projects p where p.id = project_id)
    )
  );

create policy project_members_update_by_pro_admin
  on public.project_members for update
  to authenticated
  using (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(
      (select p.workspace_id from public.projects p where p.id = project_id)
    )
  )
  with check (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(
      (select p.workspace_id from public.projects p where p.id = project_id)
    )
  );

create policy project_members_delete_by_pro_admin
  on public.project_members for delete
  to authenticated
  using (
    public.is_app_admin()
    or public.member_is_workspace_pro_or_admin(
      (select p.workspace_id from public.projects p where p.id = project_id)
    )
  );
