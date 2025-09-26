-- Update default file expiry to 1 hour instead of 7 days
ALTER TABLE public.shared_files 
ALTER COLUMN expires_at SET DEFAULT (now() + '1 hour'::interval);

-- Update existing files that haven't expired yet to use 1 hour expiry
UPDATE public.shared_files 
SET expires_at = created_at + '1 hour'::interval 
WHERE expires_at > now();

-- Enable pg_cron extension for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests to edge functions
CREATE EXTENSION IF NOT EXISTS pg_net;