-- =============================================================================
-- RETROACTIVE SYNC & PERFORMANCE OPTIMIZATION
-- 1. Indexing for High performance
-- 2. Backfilling missing snapshots for existing projects
-- =============================================================================

-- 1. Optimasi Index (Kecepatan Loading Tab Harga Satuan)
CREATE INDEX IF NOT EXISTS idx_ahsp_lines_project_id ON public.ahsp_lines (project_id);
CREATE INDEX IF NOT EXISTS idx_ahsp_line_snapshots_line_id ON public.ahsp_line_snapshots (ahsp_line_id);

-- 2. Skrip Retroactive Sync (Sekali Jalan)
-- Logika: Mengisi ahsp_line_snapshots yang kosong dari proyek lama
INSERT INTO public.ahsp_line_snapshots (
  ahsp_line_id, uraian, kode_item, satuan, koefisien, harga_konversi, jenis_komponen, subtotal, tkdn
)
SELECT 
  al.id, 
  detail.uraian, 
  detail.kode_item, 
  detail.satuan, 
  detail.koefisien, 
  detail.harga_konversi, 
  detail.jenis_komponen, 
  detail.subtotal, 
  detail.tkdn
FROM public.ahsp_lines al
-- CROSS JOIN LATERAL untuk menarik data dari view yang sudah fix (PUPR + Custom)
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements(details) as d
  FROM public.view_katalog_ahsp_lengkap
  WHERE master_ahsp_id = al.master_ahsp_id
) sub
CROSS JOIN LATERAL jsonb_to_record(sub.d) as detail(
  uraian text, kode_item text, satuan text, koefisien numeric, harga_konversi numeric, jenis_komponen text, subtotal numeric, tkdn numeric
)
WHERE al.master_ahsp_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ahsp_line_snapshots s WHERE s.ahsp_line_id = al.id
  );

-- 3. Verifikasi Keamanan Cascade
-- Memastikan ahsp_line_snapshots TIDAK merusak relasi ke daily_reports (hanya leaf table)
-- snapshots -> ahsp_lines (CASCADE ON DELETE) -> project_id
-- daily_progress -> ahsp_lines (CASCADE ON DELETE)
-- Tabel daily_reports aman karena merupakan parent dari daily_progress.

NOTIFY pgrst, 'reload schema';
