## Phase 2 — Trust Tai roadmap review console

Private operator surface mounted at `/ops`, inside the existing project but with its own layout, its own auth gate, and its own read/write surface on the **dedicated intake Supabase project** (`yjslekqzjfdzakoqbzbw`). The public marketing site and Build My Roadmap intake stay exactly as they are.

### 1. Access control

- Single allowlisted operator: `Tai@trust-tai.com` (case-insensitive, stored as a constant in `src/lib/ops/access.ts`).
- Reuses the existing Lovable Cloud Supabase auth and the existing `/auth` magic-link route.
- New pathless layout `src/routes/_ops/route.tsx`:
  - `ssr: false` (Supabase session is in localStorage).
  - `beforeLoad` calls `supabase.auth.getUser()`. If no user → redirect to `/auth?redirect=/ops/queue`. If user's email is not the allowlisted one → redirect to `/` with a toast.
  - Renders the internal layout (sidebar + topbar) and `<Outlet />`.
- All `/ops/*` routes live under this layout. No public link to `/ops` anywhere in the marketing site or footer.

### 2. New tables on the intake project

The intake project is separate from Lovable Cloud, so these are applied once via a one-off setup script (`scripts/intake/001_review_console.sql`) executed against the intake project using its service role key (`INTAKE_SUPABASE_SERVICE_ROLE_KEY`). All tables use service role only — no RLS policies needed because nothing on this project is reached by browser clients.

- `roadmap_drafts` — editable copy of the artifact:
  `id, submission_id (fk, unique), review_id (fk), content (jsonb of editable sections: situation_summary, core_constraint, strategic_diagnosis, first_moves, ninety_day_sequence, risks, recommended_engagement, next_step), version int, last_edited_by text, created_at, updated_at`.
- `review_notes` — append-only internal notes:
  `id, submission_id (fk), author_email text, body text, created_at`.
- `review_audit_log` — append-only timeline:
  `id, submission_id (fk), actor_email text, action text (one of: opened, marked_in_review, note_added, draft_saved, approved, rejected, archived, reopened, notified_operator), metadata jsonb, created_at`.
- Add columns to `roadmap_intake_reviews`: `reviewer_email text`, `decided_at timestamptz`, `internal_summary text` (short core-signal excerpt for the queue).
- Indexes: `intake_submissions(created_at desc)`, `roadmap_intake_reviews(status, updated_at desc)`.

Existing review status values stay: `needs_review`, `in_review`, `approved`, `rejected`, `archived`. Approval keeps `outbound_blocked = true`.

### 3. Server functions (new file `src/lib/ops.functions.ts`)

All gated by a single helper `requireOperator()` that resolves the Supabase user via `requireSupabaseAuth` middleware and 403s if email ≠ allowlist. Every handler loads the intake service-role client (`getIntakeClient()`) and writes through that.

- `listSubmissions({ status?, search?, sort?, limit?, offset? })` — joins `intake_submissions` + `roadmap_intake_reviews`, returns paginated list with core_signal excerpt.
- `getQueueStats()` — counts for `needs_review`, `in_review`, `approved` this week, `archived` (powers the stat cards on /ops/queue).
- `getSubmission(id)` — submission + review + draft (if any) + notes + audit log.
- `setReviewStatus({ id, status })` — updates `roadmap_intake_reviews.status`, stamps `reviewer_email`, writes audit entry.
- `addNote({ submission_id, body })` — inserts into `review_notes`, writes audit.
- `saveDraft({ submission_id, content })` — upserts `roadmap_drafts`, bumps `version`, writes audit (`draft_saved`).
- `approveSubmission({ submission_id })` — sets status `approved`, stamps `decided_at`, writes audit, then enqueues an operator-notification email (see §5). Does **not** send to founder.
- `rejectSubmission({ submission_id, reason })` — status `rejected`, audit.
- `archiveSubmission({ submission_id })` / `reopenSubmission({ submission_id })` — status flips + audit.
- `listHistory({ status?, range?, search?, page })` — for /ops/history.
- `getAnalytics({ range })` — new submissions, review backlog, approval rate, avg time to decision, delivered (=approved) this week, status funnel, top problem keywords from intake answers, submissions over time (daily bucket).

All return plain DTOs.

### 4. Routes & layout

```
src/routes/_ops/route.tsx           layout + auth gate
src/routes/_ops/ops.tsx             redirect → /ops/queue
src/routes/_ops/ops.queue.tsx       Review Queue
src/routes/_ops/ops.submissions.$id.tsx   Detail / Review Workspace
src/routes/_ops/ops.editor.$id.tsx        Roadmap Editor
src/routes/_ops/ops.delivery.$id.tsx      Delivery Preview (approval gate)
src/routes/_ops/ops.history.tsx           History
src/routes/_ops/ops.insights.tsx          Analytics / Insights
```

Each `head()` sets `noindex, nofollow` and a "Trust Tai Console" title; sitemap.xml is unchanged (no /ops entries).

Layout (`src/components/ops/OpsShell.tsx`):
- Left sidebar (dark ink panel `#0b0f1f`, white type, royal accents) with: Queue (with counts), In Review, Approved, Delivery Pending, History, Insights, Settings (placeholder).
- Top right: signed-in operator email + Sign out.
- Main content area: ivory background, denser typography, desktop-first (min-width 1100px; below that show a "Best viewed on desktop" notice but still usable).
- Reuses existing brand tokens (ink, royal, ivory) — no new global palette.

### 5. Approval = notify Tai by email

Uses the **existing Lovable Cloud email queue** (`enqueue_email` RPC, `transactional_emails` queue). New React Email template `src/lib/email-templates/ops-approval-notice.tsx` registered in `src/lib/email-templates/registry.ts`. Triggered server-side from `approveSubmission`, recipient hardcoded to `Tai@trust-tai.com`, contains: founder name, business, email, link back to `/ops/submissions/:id`, final edited roadmap content (rendered, not just JSON). Idempotency key `ops-approval-${submission_id}`. Outbound to the founder stays manual.

### 6. Page details

**/ops/queue** — Stat cards (Needs review / In review / Approved / Delivered this week from `getQueueStats`) + filters (status, search by founder/company/email/website, sort) + table (founder + email, business + website, submitted, status badge, core-signal excerpt, last updated, Open). Default filter: `needs_review` + `in_review`, sorted oldest first.

**/ops/submissions/:id** — Three columns:
- Left: founder summary, contact, business snapshot, original intake answers (collapsible accordions per question).
- Center: rendered roadmap artifact (current draft if exists, else generated artifact) with section anchors.
- Right: status badge, decision buttons (Mark in review / Approve / Reject / Archive / Open in editor), gap/risk flags (derived from `gap_analysis.missing_context`), internal notes thread with composer, audit timeline.

**/ops/editor/:id** — Three-pane editor: left = source intake answers (read-only, collapsible), center = editable sections (Situation summary, Core constraint, Strategic diagnosis, First moves, 90-day sequence, Risks, Recommended engagement, Next step) rendered as labeled `Textarea`s, right = section nav + version history (from `roadmap_drafts.version` snapshots stored as audit metadata) + "draft quality" checklist (heuristic counts: word count, all sections non-empty, no founder-name placeholder). Autosave with 1.5s debounce → `saveDraft`. Buttons: "Save draft", "Preview delivery" → `/ops/delivery/:id`, "Back to review".

**/ops/delivery/:id** — Approval gate screen. Recipient card, channel = Email (only enabled option), final roadmap rendered as the founder would see it, "Final checklist" (reflects + the recommendation is specific, etc.), explicit "I have reviewed" checkbox → enables "Approve and notify Tai" button. No founder-facing send.

**/ops/history** — Filterable by status/date range/search; right-side detail drawer with timeline + Reopen action.

**/ops/insights** — Cards (new submissions, review backlog, approval rate, avg time to decision, delivered this week) + line chart (submissions over time, simple SVG or Recharts) + funnel + bottleneck keyword frequencies derived from answers (top 8). Range selector.

### 7. Code structure (so it can be extracted later)

```
src/lib/ops/
  access.ts           OPERATOR_EMAILS allowlist + isOperator(email)
  schema.ts           zod schemas for inputs/outputs
  intake-types.ts     local types mirroring intake project rows
src/lib/ops.functions.ts   all createServerFn entrypoints
src/components/ops/
  OpsShell.tsx, OpsSidebar.tsx, OpsTopbar.tsx
  queue/...
  submission/...
  editor/...
  delivery/...
  history/...
  insights/...
src/routes/_ops/...
scripts/intake/001_review_console.sql   one-off schema applied to intake project
```

No file under `src/components/ops/` or `src/lib/ops/` is imported from any public route. No public-route loader calls any `ops.functions.ts` server fn.

### 8. Public surface guarantees

- `src/routes/build-my-roadmap.tsx`, `src/lib/intake.functions.ts`, `src/integrations/intake/client.server.ts`, `roadmap_intake_reviews.artifact` write path, and the `review_pending` / `needs_review` posture stay unchanged.
- `outbound_blocked: true` stays in newly created review rows; nothing in /ops flips that.
- No new route, link, sitemap entry, or nav item is added to the marketing site.
- The existing `_authenticated/portal` route is untouched — it's the client portal, not this console.

### 9. Out of scope for v1 (noted, not built)

Keyboard shortcuts, "Open next submission" triage button, diff between generated and edited artifact (just version history for now), automated outbound to founder, multi-operator workflow, mobile layout polish.

### 10. Definition of done

- Sign in as `Tai@trust-tai.com` at `/auth`, land on `/ops/queue`, see the real existing submission `b0a26f24…` in `needs_review`.
- Click into it, mark in review, add a note, open editor, save a draft, return, approve.
- An approval notice email is enqueued to Tai with the final edited roadmap.
- History page shows the same submission as `approved` with full audit trail.
- Insights page shows non-zero counts.
- Any non-allowlisted account hitting `/ops/*` is bounced to `/`.
- Public site, Build My Roadmap intake, and existing portal continue to work unchanged.
