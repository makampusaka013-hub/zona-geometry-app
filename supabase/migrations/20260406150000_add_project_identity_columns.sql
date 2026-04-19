-- Menambahkan kolom identitas proyek untuk dashboard RAB
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.members (user_id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.members (user_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS code TEXT,
ADD COLUMN IF NOT EXISTS program_name TEXT,
ADD COLUMN IF NOT EXISTS activity_name TEXT,
ADD COLUMN IF NOT EXISTS work_name TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS fiscal_year TEXT,
ADD COLUMN IF NOT EXISTS contract_number TEXT;

-- Memaksa Supabase PostgREST untuk memuat ulang tabel (schema cache)
NOTIFY pgrst, 'reload schema';
