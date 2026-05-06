-- Migration: Fix RLS for master_konversi
-- Tujuan: Memastikan user yang login bisa melihat dan mengedit data konversi.

-- 1. Pastikan RLS aktif
alter table public.master_konversi enable row level security;

-- 2. Hapus policy lama jika ada
drop policy if exists "Enable read access for all users" on public.master_konversi;
drop policy if exists "Enable insert for authenticated users only" on public.master_konversi;
drop policy if exists "Enable update for authenticated users only" on public.master_konversi;

-- 3. Buat policy baru yang lebih luas untuk user terautentikasi
create policy "Allow all access for authenticated users"
on public.master_konversi
for all
to authenticated
using (true)
with check (true);

-- 4. Berikan izin dasar pada tabel
grant all on public.master_konversi to authenticated;
grant usage on sequence public.master_konversi_id_seq to authenticated;
