-- 1. Create master_harga_custom
create table public.master_harga_custom (
  id uuid primary key default gen_random_uuid(),
  kategori_item text not null check (kategori_item in ('Bahan', 'Upah', 'Alat', 'Lumpsum')),
  kode_item text,
  nama_item text not null,
  satuan text,
  harga_satuan numeric(20, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create master_lumsum
create table public.master_lumsum (
  id uuid primary key default gen_random_uuid(),
  nama_pekerjaan text not null,
  satuan text default 'Ls',
  harga_total numeric(20, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Update timestamp trigger
create trigger master_harga_custom_updated_at
  before update on public.master_harga_custom
  for each row execute function public.set_updated_at();

create trigger master_lumsum_updated_at
  before update on public.master_lumsum
  for each row execute function public.set_updated_at();

-- RLS
alter table public.master_harga_custom enable row level security;
alter table public.master_lumsum enable row level security;

-- Admin and Pro only policies (read/write access)
create policy mhc_admin_pro_all on public.master_harga_custom for all to authenticated using (
  exists (select 1 from public.members m where m.user_id = auth.uid() and m.role in ('admin', 'pro'))
);

create policy ml_admin_pro_all on public.master_lumsum for all to authenticated using (
  exists (select 1 from public.members m where m.user_id = auth.uid() and m.role in ('admin', 'pro'))
);

-- Reload
NOTIFY pgrst, 'reload schema';
