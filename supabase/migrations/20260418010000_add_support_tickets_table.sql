-- Migration: Tambah Tabel Support Tickets
-- Created: 2026-04-18

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bug', 'feedback', 'feature_request', 'other')),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can insert their own tickets" ON public.support_tickets;
CREATE POLICY "Users can insert their own tickets" ON public.support_tickets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;
CREATE POLICY "Users can view their own tickets" ON public.support_tickets
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.support_tickets;
CREATE POLICY "Admins can manage all tickets" ON public.support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.members 
            WHERE members.user_id = auth.uid() AND members.role = 'admin'
        )
    );

-- Comments
COMMENT ON TABLE public.support_tickets IS 'Menyimpan laporan masalah dan feedback dari user.';
