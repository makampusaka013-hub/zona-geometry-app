-- =============================================================================
-- Migration: Add Stakeholder Columns to Projects Table
-- Description: Menambahkan kolom-kolom tanda tangan laporan langsung ke 
--              tabel projects agar proses simpan identitas jadi sederhana.
-- =============================================================================

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS ppk_name TEXT,
ADD COLUMN IF NOT EXISTS ppk_nip TEXT,
ADD COLUMN IF NOT EXISTS pptk_name TEXT,
ADD COLUMN IF NOT EXISTS pptk_nip TEXT,
ADD COLUMN IF NOT EXISTS kadis_name TEXT,
ADD COLUMN IF NOT EXISTS kadis_nip TEXT,
ADD COLUMN IF NOT EXISTS kabid_name TEXT,
ADD COLUMN IF NOT EXISTS kabid_nip TEXT,
ADD COLUMN IF NOT EXISTS konsultan_name TEXT,
ADD COLUMN IF NOT EXISTS konsultan_supervisor TEXT,
ADD COLUMN IF NOT EXISTS kontraktor_director TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS location_id UUID,
ADD COLUMN IF NOT EXISTS fiscal_year TEXT,
ADD COLUMN IF NOT EXISTS contract_number TEXT,
ADD COLUMN IF NOT EXISTS hsp_value NUMERIC(20, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ppn_percent NUMERIC(5, 2) DEFAULT 12,
ADD COLUMN IF NOT EXISTS overhead_percent NUMERIC(5, 2) DEFAULT 15,
ADD COLUMN IF NOT EXISTS program_name TEXT,
ADD COLUMN IF NOT EXISTS activity_name TEXT,
ADD COLUMN IF NOT EXISTS work_name TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS manual_duration INTEGER DEFAULT 0;

-- Reload schema
NOTIFY pgrst, 'reload schema';
