-- Run once AFTER deploying purge-expired-applications and setting its secret.
-- Enable pg_cron, pg_net, and Vault if the project has not enabled them yet.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Store these values in Vault. Replace the placeholders before running.
-- Reuse the same generated token for `supabase secrets set RETENTION_PURGE_TOKEN=...`.
select vault.create_secret('https://fxvlsnxhhrzebvtgxjan.supabase.co', 'candidate_retention_project_url');
select vault.create_secret('REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY', 'candidate_retention_publishable_key');
select vault.create_secret('REPLACE_WITH_RETENTION_PURGE_TOKEN', 'candidate_retention_token');

-- Replace an earlier schedule with the same name, then run daily at 06:30 UTC.
select cron.unschedule(jobid)
from cron.job
where jobname = 'candidate-retention-daily';

select cron.schedule(
  'candidate-retention-daily',
  '30 6 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'candidate_retention_project_url') || '/functions/v1/purge-expired-applications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'candidate_retention_publishable_key'),
        'x-retention-token', (select decrypted_secret from vault.decrypted_secrets where name = 'candidate_retention_token')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
