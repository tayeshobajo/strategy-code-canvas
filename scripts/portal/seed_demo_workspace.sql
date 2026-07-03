-- Seed demo portal workspace for shobajotaye@gmail.com
-- Rerunnable: uses stable UUIDs + ON CONFLICT / delete-and-reinsert for child rows.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/portal/seed_demo_workspace.sql
--
-- Change DEMO_EMAIL below to seed a different account.

BEGIN;

DO $seed$
DECLARE
  v_email          text := 'shobajotaye@gmail.com';
  v_project_id     uuid := 'aaaaaaa1-0000-4000-8000-000000000001';
  v_roadmap_id     uuid := 'aaaaaaa2-0000-4000-8000-000000000001';
  v_file_pdf      uuid := 'aaaaaaa3-0000-4000-8000-000000000001';
  v_file_intake   uuid := 'aaaaaaa3-0000-4000-8000-000000000002';
  v_msg_welcome   uuid := 'aaaaaaa4-0000-4000-8000-000000000001';
  v_msg_action    uuid := 'aaaaaaa4-0000-4000-8000-000000000002';
  v_perm_id       uuid := 'aaaaaaa5-0000-4000-8000-000000000001';
BEGIN
  ----------------------------------------------------------------
  -- 1. Portal project (upsert)
  ----------------------------------------------------------------
  INSERT INTO public.client_portal_projects (
    id, primary_email, contact_name, company_name, package_name,
    portal_status, payment_status, current_phase, next_milestone,
    owner_email, access_granted_at, purchase_date, payment_amount, currency
  ) VALUES (
    v_project_id, v_email, 'Shoba Jotaye', 'Jotaye Ventures', 'Strategy Sprint',
    'roadmap_delivered', 'paid', 'Roadmap Delivered', 'Kick-off execution call',
    'hello@trust-tai.com', now() - interval '10 days', now() - interval '12 days',
    250000, 'usd'
  )
  ON CONFLICT (id) DO UPDATE SET
    primary_email = EXCLUDED.primary_email,
    contact_name  = EXCLUDED.contact_name,
    company_name  = EXCLUDED.company_name,
    package_name  = EXCLUDED.package_name,
    portal_status = EXCLUDED.portal_status,
    current_phase = EXCLUDED.current_phase,
    next_milestone = EXCLUDED.next_milestone,
    owner_email   = EXCLUDED.owner_email,
    updated_at    = now();

  ----------------------------------------------------------------
  -- 2. Client permission grant
  ----------------------------------------------------------------
  INSERT INTO public.client_portal_permissions (id, v_project_id, email, granted_by, granted_at, revoked_at)
  VALUES (v_perm_id, v_project_id, v_email, 'hello@trust-tai.com', now() - interval '10 days', NULL)
  ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, email = EXCLUDED.email;

  ----------------------------------------------------------------
  -- 3. Files (delete then insert so rerun is clean)
  ----------------------------------------------------------------
  DELETE FROM public.client_portal_files WHERE v_project_id = v_project_id;

  INSERT INTO public.client_portal_files (
    id, v_project_id, storage_path, file_name, category, file_type, mime_type,
    size_bytes, uploaded_by_email, uploaded_by_role, client_visible,
    approved_by_email, approved_at, view_count, download_count,
    last_viewed_at, last_downloaded_at
  ) VALUES
  (v_file_pdf, v_project_id,
   'demo/' || v_project_id || '/roadmap-v1.pdf', 'Strategy Sprint Roadmap v1.pdf',
   'Roadmap', 'pdf', 'application/pdf', 482113,
   'hello@trust-tai.com', 'tai', true,
   'hello@trust-tai.com', now() - interval '6 days',
   3, 1, now() - interval '2 days', now() - interval '2 days'),
  (v_file_intake, v_project_id,
   'demo/' || v_project_id || '/intake-summary.pdf', 'Intake Summary.pdf',
   'Onboarding', 'pdf', 'application/pdf', 128944,
   'hello@trust-tai.com', 'tai', true,
   'hello@trust-tai.com', now() - interval '8 days',
   1, 0, now() - interval '5 days', NULL);

  ----------------------------------------------------------------
  -- 4. Roadmap (upsert)
  ----------------------------------------------------------------
  INSERT INTO public.client_portal_roadmaps (
    id, v_project_id, title, version_label, status, approved_at,
    executive_summary, current_diagnosis, strategic_priorities,
    sequence_30_60_90, risks_dependencies, recommended_next_move,
    pdf_file_id, current_focus, owner_name, next_milestone
  ) VALUES (
    v_roadmap_id, v_project_id, 'Jotaye Ventures — Strategy Sprint', 'Version 1',
    'delivered', now() - interval '6 days',
    'Focus the next 90 days on tightening the offer, pricing, and top-of-funnel positioning.',
    'Current growth is inbound-heavy and price-anchored below willingness to pay.',
    '[
      {"title":"Reprice core offer","detail":"Move Strategy Sprint from $2.5k to $5k with proof-of-value gating."},
      {"title":"Ship founder-led content engine","detail":"Weekly essay + 3 short-form cuts."},
      {"title":"Instrument the funnel","detail":"Attribution from first touch through paid engagement."}
    ]'::jsonb,
    '{
      "30":["Reprice + refresh sales page","Tighten intake to qualify at $5k"],
      "60":["Publish 8 essays","Book 12 discovery calls"],
      "90":["Close 3 Strategy Sprints","Convert 1 to retainer"]
    }'::jsonb,
    '[
      {"risk":"Founder bandwidth","mitigation":"Batch record content Fridays"},
      {"risk":"Pricing pushback","mitigation":"Lead with case-study proof"}
    ]'::jsonb,
    'Approve the reprice and lock the content cadence by Monday.',
    v_file_pdf, 'Reprice + funnel instrumentation', 'Shoba Jotaye',
    'Kick-off execution call'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    approved_at = EXCLUDED.approved_at,
    executive_summary = EXCLUDED.executive_summary,
    strategic_priorities = EXCLUDED.strategic_priorities,
    sequence_30_60_90 = EXCLUDED.sequence_30_60_90,
    risks_dependencies = EXCLUDED.risks_dependencies,
    recommended_next_move = EXCLUDED.recommended_next_move,
    pdf_file_id = EXCLUDED.pdf_file_id,
    updated_at = now();

  ----------------------------------------------------------------
  -- 5. Messages (upsert)
  ----------------------------------------------------------------
  INSERT INTO public.client_portal_messages (
    id, v_project_id, sender_type, author_email, subject, body,
    message_type, visible_to_client, action_required
  ) VALUES
  (v_msg_welcome, v_project_id, 'tai', 'hello@trust-tai.com',
   'Your roadmap is live',
   'The Strategy Sprint roadmap is published in the portal. Review the strategic priorities and confirm the reprice before Monday.',
   'update', true, false),
  (v_msg_action, v_project_id, 'tai', 'hello@trust-tai.com',
   'Action needed: confirm reprice',
   'Please confirm you want to move Strategy Sprint to $5k so we can update the sales page and intake.',
   'action_item', true, true)
  ON CONFLICT (id) DO UPDATE SET
    body = EXCLUDED.body,
    subject = EXCLUDED.subject,
    updated_at = now();

  ----------------------------------------------------------------
  -- 6. Activity feed (wipe + reseed for a clean timeline)
  ----------------------------------------------------------------
  DELETE FROM public.client_portal_activity
   WHERE v_project_id = v_project_id
     AND metadata ? 'seed'
     AND (metadata->>'seed') = 'demo';

  INSERT INTO public.client_portal_activity
    (v_project_id, actor_type, actor_email, event_type, summary, client_visible, metadata, created_at)
  VALUES
  (v_project_id, 'system', NULL, 'portal_access_granted',
   'Portal access granted to ' || v_email, true,
   jsonb_build_object('seed','demo'), now() - interval '10 days'),
  (v_project_id, 'tai', 'hello@trust-tai.com', 'roadmap_published',
   'Trust Tai published Version 1 of your roadmap.', true,
   jsonb_build_object('seed','demo','v_roadmap_id',v_roadmap_id), now() - interval '6 days'),
  (v_project_id, 'client', v_email, 'file_viewed',
   'You previewed Strategy Sprint Roadmap v1.pdf', true,
   jsonb_build_object('seed','demo','file_id',v_file_pdf), now() - interval '2 days'),
  (v_project_id, 'client', v_email, 'file_downloaded',
   'You downloaded Strategy Sprint Roadmap v1.pdf', true,
   jsonb_build_object('seed','demo','file_id',v_file_pdf), now() - interval '2 days'),
  (v_project_id, 'tai', 'hello@trust-tai.com', 'follow_up_needed',
   'Trust Tai flagged an item that needs your attention.', true,
   jsonb_build_object('seed','demo','message_id',v_msg_action), now() - interval '1 days');

  UPDATE public.client_portal_projects
     SET last_client_activity_at = now() - interval '2 days'
   WHERE id = v_project_id;
END
$seed$;

COMMIT;

-- Quick verification (safe to leave in — read-only):
SELECT 'project'  AS entity, count(*) FROM public.client_portal_projects  WHERE lower(primary_email) = 'shobajotaye@gmail.com'
UNION ALL SELECT 'perms',    count(*) FROM public.client_portal_permissions WHERE lower(email) = 'shobajotaye@gmail.com' AND revoked_at IS NULL
UNION ALL SELECT 'files',    count(*) FROM public.client_portal_files      WHERE v_project_id = 'aaaaaaa1-0000-4000-8000-000000000001'
UNION ALL SELECT 'roadmaps', count(*) FROM public.client_portal_roadmaps   WHERE v_project_id = 'aaaaaaa1-0000-4000-8000-000000000001'
UNION ALL SELECT 'messages', count(*) FROM public.client_portal_messages   WHERE v_project_id = 'aaaaaaa1-0000-4000-8000-000000000001'
UNION ALL SELECT 'activity', count(*) FROM public.client_portal_activity   WHERE v_project_id = 'aaaaaaa1-0000-4000-8000-000000000001';
