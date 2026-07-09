# Build Execution / OpenClaw Handoff v1

Package the approved Implementation Plan into controlled build packets with prompts, scope, evidence tracking, and lifecycle — no autonomous execution.

## 1. Database migration

New table `engine_project_build_packets`:
- id, project_id (FK engine_projects), implementation_plan_id (FK engine_project_implementation_plans)
- title, summary, status (enum: draft|ready|handed_off|in_progress|returned|qa_required|accepted|rejected|archived)
- packet_type (lovable|openclaw|developer|qa|mixed), sequence_number int, priority (p0|p1|p2)
- payload jsonb (schema below)
- created_by/email, assigned_to, handed_off_at, accepted_by/email, accepted_at, archived_at
- created_at, updated_at (+ trigger)

New table `engine_project_build_evidence`:
- id, project_id, build_packet_id (FK cascade)
- evidence_type (screenshot|log|diff_summary|qa_report|link|note|artifact)
- title, summary, payload jsonb
- created_by/email, created_at

Security:
- GRANT SELECT to authenticated (RLS staff-only via `has_role` operator/admin); GRANT ALL to service_role; no anon
- RLS: staff SELECT via has_role; all writes blocked at policy level for authenticated (mutations via service-role in server fns)
- Trigger: block UPDATE on packets when previous status is `accepted` or `archived` (except `archived_at` field)
- Trigger: forbid deleting evidence rows unless service_role
- update_updated_at trigger

## 2. Server functions (`src/lib/engine-build-execution.functions.ts`)

All use `requireSupabaseAuth` + staff assertion (reuse `assertStaff` pattern from chat fns). Mutations dynamic-import `client.server` for `supabaseAdmin`.

- `getProjectBuildExecution(projectId)` → project header, approved impl plan summary, packets grouped by status, evidence counts, NBA hint
- `generateBuildPackets(projectId)` — requires approved implementation plan; calls Lovable AI with impl+QA+backend+mockup+frame+spine context; inserts draft packets; audit + activity; refuses if no approved plan
- `saveBuildPacketDraft(packetId, payload)`
- `markBuildPacketReady(packetId)` (from draft)
- `handoffBuildPacket(packetId)` (ready → handed_off; sets handed_off_at)
- `markBuildPacketInProgress(packetId)`
- `markBuildPacketReturned(packetId, evidence?)`
- `markBuildPacketQaRequired(packetId)`
- `acceptBuildPacket(packetId, { evidenceAck })` — admin/operator; requires evidence rows OR explicit ack note; audit
- `rejectBuildPacket(packetId, reason)`
- `archiveBuildPacket(packetId)` — admin
- `addBuildEvidence(packetId, evidence)`

Every mutation writes `engine_audit_log` + `engine_activity`. Invalid state transitions throw. None touch client_portal_*, roadmap_approvals, engine_projects.status, or QA/impl plan payloads.

## 3. AI generation prompt (`src/lib/engine-build-execution-prompt.server.ts`)

Composes context from approved impl plan phases/build_steps, QA plan, backend plan, mockups/frames, spine, tasks, risks. Output schema (JSON):

```
{ packets: [{
  title, summary, packet_type, priority, sequence_number,
  payload: {
    packet_goal, source_implementation_steps[],
    target_builder, execution_scope: { included[], excluded[], expected_files_or_surfaces[], do_not_touch[] },
    handoff_prompt, context_summary, implementation_steps[],
    acceptance_criteria[], qa_requirements[], evidence_required[],
    risk_notes[], rollback_notes[], dependencies[], blocking_conditions[],
    post_execution_checks[], open_decisions[]
  }
}] }
```

Prompt forbids "execute", "deploy", "apply", "mark passed", "delivered".

## 4. Route + UI (`src/routes/engine.projects.$projectId.build-execution.tsx`)

Sections:
- **Header**: project header strip, current status, NBA, approved impl plan badge, packet count, "Generate Build Packets" (disabled + tooltip when no approved impl plan)
- **Execution Overview**: counts by status, next packet recommendation
- **Packet Board**: grouped columns by status; cards show title/type/seq/priority/goal/target/deps/blockers/evidence count/next action
- **Packet Detail Drawer**: full payload sections, activity + evidence history, lifecycle action buttons (permission-gated), Copy handoff prompt
- **Handoff Prompt Panel** (in drawer): large monospaced block, copy button, target label, safety notes, do-not-touch warning
- **Evidence Section**: list rows + "Add evidence" modal (type, title, summary, payload URL/note)
- **Right AI PM panel**: reuse `StepAiPanelFor` pattern with build-execution context

Filters: status, priority, target builder.

## 5. Workspace nav integration

`src/components/engine/WorkspaceHeader.tsx`: add "Build Execution" tab after "Implementation Plan" pointing to the new route. Update `WORKSPACE_STEPS` in `src/lib/engine-workspace.ts` if steps drive stepper.

## 6. Chat context (`src/lib/engine-chat-context.server.ts` + `engine-chat-prompt.server.ts`)

Add build-execution slice: packet counts by status, next packet, blocked packets, missing evidence, accepted count. Prompt gains hard rule: chat may summarize/answer but never execute OpenClaw, run shell, deploy, mark passed/delivered/accept packets — user must act in UI.

## 7. Types

Regenerate `src/integrations/supabase/types.ts` after migration approval to include the two new tables.

## 8. Discipline (enforced in code + prompts)

Allowed: generate packets, copy prompt, lifecycle transitions, evidence collection, accept/reject.
Forbidden: auto-run OpenClaw/Lovable, apply migrations, deploy, mark QA passed, mark delivered, mutate approved upstream payloads.

## 9. Deliverables at end

- Migration file
- New server-fn file + prompt file
- New route file
- Updated WorkspaceHeader + chat context/prompt + types
- Screenshots checklist (route empty, generation disabled, packets board, detail drawer, evidence add) — captured after user runs QA harness in a follow-up
- Recommended QA prompt appended to plan for the next end-to-end verification pass (mirroring implementation-plan-v1-qa.py)

## Technical notes

- Follows existing patterns from `engine-implementation-plan.functions.ts` and route `.implementation-plan.tsx` for lifecycle/UI conventions.
- `assertStaff` reused; admin-only actions check `has_role(admin)`.
- All secrets/env stay server-side; no `supabaseAdmin` at module scope of `.functions.ts` — dynamic-import inside handlers.
- No changes to protected surfaces (portal, roadmap approvals, investment terms, project delivery status).
