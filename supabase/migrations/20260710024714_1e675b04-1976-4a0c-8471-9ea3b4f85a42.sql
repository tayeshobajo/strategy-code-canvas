GRANT SELECT ON public.engine_project_openclaw_monitor_events TO authenticated;
GRANT SELECT ON public.engine_project_openclaw_monitor_settings TO authenticated;
GRANT ALL ON public.engine_project_openclaw_monitor_events TO service_role;
GRANT ALL ON public.engine_project_openclaw_monitor_settings TO service_role;

INSERT INTO public.engine_project_openclaw_runs
  (id, project_id, build_packet_id, status, provider, run_mode,
   started_at, completed_at, error_code, error_message, output_summary,
   started_by_email, request_payload, response_payload)
VALUES
  ('f4110000-0000-4000-8000-0000000004f1'::uuid,
   'bbbbbbb1-0000-4000-8000-000000000002',
   '2accd9f3-0cf4-494b-a0c1-604f07bfd21d',
   'failed', 'openclaw', 'manual',
   now() - interval '45 minutes',
   now() - interval '40 minutes',
   'provider_error',
   'Fixture: simulated provider failure for v5 detector coverage.',
   'Fixture failed run for OpenClaw v5 QA evidence.',
   'tai@trust-tai.com',
   '{"fixture": true}'::jsonb,
   '{"fixture": true, "reason": "seed"}'::jsonb);

INSERT INTO public.engine_project_openclaw_runs
  (id, project_id, build_packet_id, status, provider, run_mode,
   started_at, completed_at, output_summary,
   started_by_email, request_payload, response_payload)
VALUES
  ('c0110000-0000-4000-8000-0000000004c1'::uuid,
   'bbbbbbb1-0000-4000-8000-000000000002',
   'e3126e90-9211-45d7-add7-ea88a1a55b9d',
   'completed', 'openclaw', 'manual',
   now() - interval '50 minutes',
   now() - interval '25 minutes',
   'Fixture completed run without return-for-review; used to prove openclaw_run_completed_not_returned detector.',
   'tai@trust-tai.com',
   '{"fixture": true}'::jsonb,
   '{"fixture": true, "reason": "seed"}'::jsonb);