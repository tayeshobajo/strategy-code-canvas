## Problem

Operator sees "Failed to load Command Center: permission denied for function has_role" and no submissions load. Root cause: an earlier hardening migration revoked `EXECUTE` on several `SECURITY DEFINER` helper functions from the `authenticated` role. Those helpers (`has_role`, `has_client_access`, `client_portal_is_operator`, `current_client_portal_project_id`) are called from RLS policies on many tables (engine_projects, engine_signals, client_portal_*, etc.). When RLS evaluates a policy, the function runs as the calling role — with EXECUTE revoked, every query against those tables now 500s with "permission denied for function".

The revoke was correct for the truly admin-only helpers (`enqueue_email`, `admin_list_email_dlq`, `admin_retry_email_dlq`) — those stay restricted.

## Fix

One migration that restores `EXECUTE` to `authenticated` (and `anon` where policies allow anon) on the RLS-helper functions only:

- `public.has_role(uuid, public.app_role)` → GRANT EXECUTE TO authenticated
- `public.has_client_access(text)` → GRANT EXECUTE TO authenticated
- `public.client_portal_is_operator(text)` → GRANT EXECUTE TO authenticated
- `public.current_client_portal_project_id()` → GRANT EXECUTE TO authenticated

These are `SECURITY DEFINER` role-membership checks — safe to expose to `authenticated`; they only return booleans/ids about the caller's own access. Admin-mutation helpers (`enqueue_email`, DLQ admin functions) remain service_role-only.

## Verification

- Reload `/engine` as operator → Command Center loads with data.
- Spot check `/ops/queue`, `/admin`, `/portal/*` — no "permission denied for function" errors.
- Re-check the previously-fixed security finding: it stays resolved because the admin-only functions above remain locked down.

## Scope

Data-layer only. No UI or business-logic changes; the routes already handle data correctly — they've just been blocked at the RLS layer.
