-- ============================================================
-- MIGRATION: Fix Advance Role Constraint
-- Drop the legacy check constraint that limits roles to (admin, pro, normal, view)
-- This allows the 'advance' role (added via ALTER TYPE) to be saved to the table.
-- ============================================================

-- 1. Drop the restrictive check constraint
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_role_check;

-- 2. Ensure 'advance' is part of the enum (idempotent)
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'advance';

-- 3. Log completion
COMMENT ON CONSTRAINT members_role_check ON public.members IS NULL;
