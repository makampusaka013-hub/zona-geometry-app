-- Migration: Fix missing columns in daily_reports
-- Description: Ensures that all columns used by the Documentation and Progress tabs exist.

-- 1. Add missing columns to daily_reports
ALTER TABLE public.daily_reports 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS weather_description TEXT,
ADD COLUMN IF NOT EXISTS weather_index INTEGER DEFAULT 0;

-- 2. Data Migration: If old 'weather' column exists, copy to 'weather_description'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_reports' AND column_name='weather') THEN
        UPDATE public.daily_reports SET weather_description = weather WHERE weather_description IS NULL;
    END IF;
END $$;

-- 3. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
