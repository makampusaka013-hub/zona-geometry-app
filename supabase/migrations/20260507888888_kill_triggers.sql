
-- =============================================================================
-- EMERGENCY FIX: KILL ALL AUTOMATIC RESET TRIGGERS
-- Jalankan ini di SQL Editor Supabase Anda untuk menghentikan reset Pagu.
-- =============================================================================

-- 1. Matikan semua trigger di tabel projects (Tempat Pagu berada)
ALTER TABLE public.projects DISABLE TRIGGER ALL;

-- 2. Reset nilai Pagu ke 0 (Atau nilai yang Anda inginkan)
UPDATE public.projects SET hsp_value = 0 WHERE id = '809225fa-fb3f-452c-9fc4-285edf210a56';

-- 3. Hapus nilai DEFAULT yang mungkin tersangkut
ALTER TABLE public.projects ALTER COLUMN hsp_value SET DEFAULT 0;

-- 4. Aktifkan kembali HANYA trigger audit (Jika Anda memerlukannya)
-- Jika Anda tidak tahu nama triggernya, biarkan saja semua mati dulu untuk tes.
-- ALTER TABLE public.projects ENABLE TRIGGER tr_audit_projects;

-- 5. Beritahu server untuk muat ulang schema
NOTIFY pgrst, 'reload schema';
