# CLAUDE.md — Roadmap Engine Build Context

> This file is Captain's persistent context for autonomous builds on this repo.
> Read this at the start of every Claude Code session. Do not skip it.

---

## What This App Is

**strategy-code-canvas** = The Trust Tai Roadmap Engine.
Lovable project: `b3555ed3-b0dc-4def-8fee-77ff34a2cb82`
Production: `trusttai.com` (Lovable Publish required — git push alone does NOT update production)
Supabase: `jqehcikzvyewijjvpszh`

This is an AI-powered business enablement OS. The Captain (AI) understands a specific business, generates a fit-for-purpose roadmap, then drives execution through delivery. Not a checklist generator. A living operating system tuned to one business.

---

## Stack

- **Framework**: TanStack Start (React, file-based routing)
- **Styling**: Tailwind CSS + shadcn/ui
- **DB**: Supabase (Postgres + RLS)
- **Auth middleware**: `requireSupabaseAuth` from `@/integrations/supabase/auth-middleware`
- **Role checks**: `hasRoleForEmail` from `@/lib/ops/access`
- **AI calls**: `callLovableAi` / `parseJsonOutput` from `@/lib/engine-ai.server`
- **Server functions**: `createServerFn` from `@tanstack/react-start`

## Key Import Paths

```ts
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { callLovableAi, parseJsonOutput } from "@/lib/engine-ai.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
```

## Routing Convention

File-based routing under `src/routes/`.
- Engine routes: `src/routes/engine/$projectId/`
- Portal routes: `src/routes/portal/`
- Admin ops: `src/routes/ops/`

---

## Critical Rules — Non-Negotiable

1. **No schema migrations autonomously.** Any Supabase migration that adds/drops/alters columns or constraints MUST be written to `.orchestrator/PENDING_MIGRATIONS.md` and flagged to Tai. Do NOT apply it.

2. **No approval of own work.** The AI cannot mark its own output as accepted. Any function where `created_by` = `approved_by` (same agent) must be rejected at the DB layer. If building Phase 9C, write the migration to PENDING_MIGRATIONS.md — do not apply.

3. **No client-facing publishing without human gate.** Nothing goes to the client portal without passing through the internal approval workflow first.

4. **Always write output to `.orchestrator/`** after completing a phase. Format: `.orchestrator/phase-[id]-output.md`. This is how Captain tracks what's done.

5. **If a TypeScript error appears, fix it before moving to the next phase.** Never commit broken code.

6. **Commit after each phase completes.** Small commits. Message format: `feat(phase-[id]): [what was built]`

---

## Key DB Tables

| Table | Purpose |
|---|---|
| `engine_project_chat_proposals` | Proposals from Captain chat. Types: client_clarification, review_item, suggested_task, implementation_prompt, qa_checklist, milestone_brief |
| `engine_review_items` | Approvals Queue feed |
| `engine_activity` | Audit trail |
| `engine_project_chat_events` | Chat-level audit events |
| `engine_milestones` | Milestones on the roadmap |
| `engine_projects` | Project spine + status |
| `engine_tasks` | Execution tasks (admin-only create) |
| `engine_frames` | Plans & specs frames |
| `engine_evidence` | Evidence records |

---

## Current Build State

Read `.orchestrator/BUILD_STATE.md` for the active phase queue and what's been completed.

---

## The Three Highest-Leverage Gaps (build in order)

1. **Phase 2C — Proposed Change Flow** — Wire `ProposalCard` into chat route. Add approve/reject server mutations. Infrastructure already exists.
2. **Phase 6C + 13B — Client Acknowledgment + Portal boundary** — Client must formally acknowledge roadmap before phases begin. Portal must be downstream-only from approved internal state.
3. **Phase 9C — AI self-assessment prevention** — DB-layer constraint. Write to PENDING_MIGRATIONS.md, do not apply.

---

## Full Phase Map

See `doctrine/ROADMAP_ENGINE_PHASE_MAP.md` in this repo for the complete 15-layer, 38-phase map to 100%.
