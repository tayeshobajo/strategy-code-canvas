-- ============================================================================
-- Trust Tai Roadmap Console — Phase 2 schema (intake project only)
-- Apply this ONCE in the dedicated intake Supabase project SQL editor.
-- Project: yjslekqzjfdzakoqbzbw
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1. Augment existing roadmap_intake_reviews -----------------------------------
alter table public.roadmap_intake_reviews
  add column if not exists reviewer_email   text,
  add column if not exists decided_at       timestamptz,
  add column if not exists internal_summary text;

-- 2. Editable roadmap drafts ---------------------------------------------------
create table if not exists public.roadmap_drafts (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.intake_submissions(id) on delete cascade,
  review_id       uuid references public.roadmap_intake_reviews(id) on delete set null,
  content         jsonb not null default '{}'::jsonb,
  version         integer not null default 1,
  last_edited_by  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (submission_id)
);

-- 3. Append-only internal notes ------------------------------------------------
create table if not exists public.review_notes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.intake_submissions(id) on delete cascade,
  author_email  text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists review_notes_submission_id_idx
  on public.review_notes(submission_id, created_at desc);

-- 4. Append-only audit log -----------------------------------------------------
create table if not exists public.review_audit_log (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.intake_submissions(id) on delete cascade,
  actor_email   text,
  action        text not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists review_audit_log_submission_id_idx
  on public.review_audit_log(submission_id, created_at desc);

-- 5. Touch trigger for updated_at on drafts -----------------------------------
create or replace function public.tg_roadmap_drafts_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_roadmap_drafts_touch on public.roadmap_drafts;
create trigger trg_roadmap_drafts_touch
  before update on public.roadmap_drafts
  for each row execute function public.tg_roadmap_drafts_touch();

-- 6. Helpful indexes -----------------------------------------------------------
create index if not exists intake_submissions_created_at_desc_idx
  on public.intake_submissions(created_at desc);
create index if not exists roadmap_intake_reviews_status_updated_idx
  on public.roadmap_intake_reviews(status, updated_at desc);

-- 7. Lock everything to service_role -------------------------------------------
-- These tables are only ever read/written by the Trust Tai server using the
-- intake project's service role key. Browser clients never touch them.
revoke all on public.roadmap_drafts      from public, anon, authenticated;
revoke all on public.review_notes        from public, anon, authenticated;
revoke all on public.review_audit_log    from public, anon, authenticated;
grant all  on public.roadmap_drafts      to service_role;
grant all  on public.review_notes        to service_role;
grant all  on public.review_audit_log    to service_role;

alter table public.roadmap_drafts     enable row level security;
alter table public.review_notes       enable row level security;
alter table public.review_audit_log   enable row level security;
-- No policies = no access for anon/authenticated. service_role bypasses RLS.
