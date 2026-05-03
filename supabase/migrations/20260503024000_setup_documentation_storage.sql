-- Migration: Setup Storage for Documentation
-- Description: Creates the 'project-photos' bucket and sets up RLS policies.

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (just in case)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policies for 'project-photos' bucket

-- A. Allow Public Read Access
DROP POLICY IF EXISTS "Public Read Documentation Photos" ON storage.objects;
CREATE POLICY "Public Read Documentation Photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-photos');

-- B. Allow Authenticated Insert Access
DROP POLICY IF EXISTS "Auth Insert Documentation Photos" ON storage.objects;
CREATE POLICY "Auth Insert Documentation Photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-photos');

-- C. Allow Users to Delete their own photos (Optional but recommended)
DROP POLICY IF EXISTS "Users Delete Own Documentation Photos" ON storage.objects;
CREATE POLICY "Users Delete Own Documentation Photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-photos' AND (select auth.uid()) = owner);
