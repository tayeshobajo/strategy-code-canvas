
UPDATE public.engine_sources
SET status = 'queued',
    error = NULL,
    updated_at = now()
WHERE id = '24e60cbe-d1df-45d8-8122-669fe4f1cf4a'
  AND project_id = '3ade32db-1496-4a34-98ad-b63d3ad522f9';
