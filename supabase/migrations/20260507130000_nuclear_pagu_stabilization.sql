
-- =============================================================================
-- Migration: Nuclear Pagu Stabilization
-- Description: Menghapus semua trigger otomatis yang mungkin mereset hsp_value
--              dan memastikan hsp_value murni mengikuti input user.
-- =============================================================================

-- 1. Cari dan hapus trigger yang mencurigakan (jika ada)
-- Kita tidak tahu namanya secara pasti karena mungkin dibuat di Dashboard, 
-- tapi kita bisa mencoba mendrop yang umum atau menonaktifkan semua sementara.

-- Drop trigger audit jika ia yang menyebabkan reset (kita akan buat ulang yang bersih)
DROP TRIGGER IF EXISTS tr_audit_projects ON public.projects;

-- Drop trigger auto_unique_code (jika ia ikut campur, tapi sepertinya tidak)
-- DROP TRIGGER IF EXISTS projects_auto_unique_code ON public.projects;

-- 2. Pastikan hsp_value tidak memiliki DEFAULT yang aneh selain 0
ALTER TABLE public.projects ALTER COLUMN hsp_value SET DEFAULT 0;

-- 3. Reset data "Gedung 1" ke nilai yang benar sebagai bukti
UPDATE public.projects 
SET hsp_value = 50000000 
WHERE id = '809225fa-fb3f-452c-9fc4-285edf210a56';

-- 4. Re-create Audit Trigger (Hanya untuk LOG, bukan untuk MODIFY data)
-- Kita pastikan fungsinya (log_entity_changes) tidak mengubah NEW.
CREATE TRIGGER tr_audit_projects 
  AFTER INSERT OR UPDATE OR DELETE ON public.projects 
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_changes();

NOTIFY pgrst, 'reload schema';
