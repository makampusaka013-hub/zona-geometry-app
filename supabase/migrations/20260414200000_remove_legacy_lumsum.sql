-- Migration to remove legacy master_lumsum system
-- All lumpsum data is now unified in master_harga_custom (kategori_item = 'Lumpsum')

-- 1. Drop table (CASCADE will automatically handle associated triggers)
DROP TABLE IF EXISTS public.master_lumsum CASCADE;

-- 2. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
