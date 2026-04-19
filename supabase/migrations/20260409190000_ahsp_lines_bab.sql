-- Menambahkan dukungan "Grouping/Bab Pekerjaan" ke dalam database RAB
ALTER TABLE public.ahsp_lines 
ADD COLUMN IF NOT EXISTS bab_pekerjaan text default 'Tanpa Kategori';
