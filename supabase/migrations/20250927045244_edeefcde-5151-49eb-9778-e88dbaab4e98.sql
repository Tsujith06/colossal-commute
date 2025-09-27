-- Set up cron job to run cleanup function every hour
SELECT cron.schedule(
  'cleanup-expired-files-hourly',
  '0 * * * *', -- Run at the start of every hour
  $$
  SELECT
    net.http_post(
        url:='https://fkihtvercgsguqhxcsry.supabase.co/functions/v1/cleanup-expired-files',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZraWh0dmVyY2dzZ3VxaHhjc3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyNzc4NTEsImV4cCI6MjA3Mzg1Mzg1MX0.WzS3YD3b2aLyEUGqNQuX_IBuX894uHGt507fkzfa_Rg"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);