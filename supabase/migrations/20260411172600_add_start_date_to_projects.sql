-- Migration: Add start_date to projects

ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;

COMMENT ON COLUMN public.projects.start_date IS 'Tanggal mulai proyek untuk dasar kalkulasi offset Gantt Chart secara persisten.';
