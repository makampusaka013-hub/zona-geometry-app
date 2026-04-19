-- Enable RLS on ahsp_lines table
ALTER TABLE public.ahsp_lines ENABLE ROW LEVEL SECURITY;

-- Ensure security policies exist (if not already created)
-- Usually policies are already there based on the user's error message, 
-- but enabling RLS is the missing step.
