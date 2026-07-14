SELECT cron.schedule(
  'outcome-checkins-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b3555ed3-b0dc-4def-8fee-77ff34a2cb82.lovable.app/api/public/hooks/outcome-checkins',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);