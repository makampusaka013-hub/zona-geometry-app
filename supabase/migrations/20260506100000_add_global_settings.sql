-- Migration: Add global settings table for app-wide configurations
CREATE TABLE IF NOT EXISTS public.global_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default profit
INSERT INTO public.global_settings (key, value)
VALUES ('default_profit', '15')
ON CONFLICT (key) DO NOTHING;

-- Grant access
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all authenticated users" ON public.global_settings
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access to admins" ON public.global_settings
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
    );

-- RPC to update global profit and update setting
CREATE OR REPLACE FUNCTION update_global_profit(p_profit numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update all AHSP items
  UPDATE public.master_ahsp
  SET overhead_profit = p_profit
  WHERE id IS NOT NULL;

  -- Store in settings
  INSERT INTO public.global_settings (key, value)
  VALUES ('default_profit', to_jsonb(p_profit))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
END;
$$;

-- Function to get global profit easily
CREATE OR REPLACE FUNCTION get_global_profit()
RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
  SELECT (value->>0)::numeric FROM public.global_settings WHERE key = 'default_profit';
$$;
