-- Migration: Add Google Drive support to project photos
-- Description: Adds columns to track storage source and external file IDs for cloud integration.

-- 1. Create Storage Type Enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_source') THEN
        CREATE TYPE public.storage_source AS ENUM ('supabase', 'drive');
    END IF;
END $$;

-- 2. Update projects table to store a specific Drive folder ID for each project
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS google_drive_folder_id TEXT;

-- 3. Update project_photos table to support different storage sources
ALTER TABLE public.project_photos 
ADD COLUMN IF NOT EXISTS storage_type public.storage_source DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'image/jpeg';

-- 4. Comment on columns for better documentation
COMMENT ON COLUMN public.project_photos.drive_file_id IS 'ID file unik dari Google Drive API';
COMMENT ON COLUMN public.project_photos.storage_type IS 'Sumber penyimpanan file: supabase atau drive';
COMMENT ON COLUMN public.projects.google_drive_folder_id IS 'ID folder root di Google Drive untuk menyimpan dokumentasi proyek ini';

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
