-- Migration to add HSP (Harga Satuan Perkiraan / Pagu Anggaran) to projects

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS hsp_value NUMERIC(18,2) DEFAULT 0;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
