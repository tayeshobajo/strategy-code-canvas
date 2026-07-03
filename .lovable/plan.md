## 1) Sidebar confirmation

The client portal sidebar in `src/routes/portal.tsx` already renders everything shown in your screenshot:

- Trust Tai logo → home link
- CLIENT PORTAL eyebrow
- Nav items in order: Home, Roadmap, Files, Messages (with unread badge), Billing, Activity
- "Your success is our mission." footer card
- User chip (avatar + name + Client) + Sign out

No changes needed — it matches. ✅

## 2) Scaffold app email infrastructure

Email domain `notify.trusttai.com` is already verified, so we can go straight to scaffolding.

Steps:
1. `email_domain--setup_email_infra` — provisions pgmq queues, `email_send_log`, `suppressed_emails`, unsubscribe tokens, the `process-email-queue` route, pg_cron, and vault secrets.
2. `email_domain--scaffold_transactional_email` — creates the send/preview/unsubscribe/suppression server routes, the templates registry (`src/lib/email-templates/registry.ts`), a sample template, and a branded unsubscribe page.
3. Install any missing packages the scaffolder needs (`@lovable.dev/email-js`, `@lovable.dev/webhooks-js`, `@react-email/components`, `react-email`).
4. Ensure `src/start.ts` middleware and `__root.tsx` `beforeLoad` pass `/lovable/*` and `/email/unsubscribe` through untouched (scaffolder handles, verify).

## 3) Admin-access confirmation email

New template: `src/lib/email-templates/admin-access-granted.tsx`

- Brand-consistent React Email template (ivory bg, royal accent, display font stack matching the site).
- Props: `recipientName?`, `grantedByName?`, `adminDashboardUrl`.
- Subject: **"You now have admin access to Trust Tai"**
- Preview text: "Your Trust Tai admin access is active."
- Body copy (calm/premium tone):
  - H1: "Admin access enabled"
  - "Hi {name or there}, your account (`hello@trust-tai.com`) now has admin access to the Trust Tai workspace."
  - Bulleted "What you can do now": manage client portals, publish roadmaps, review activity, manage user roles.
  - Primary CTA button → `${SITE_URL}/admin`
  - Small footer: "If you didn't expect this, reply to this email and we'll investigate."
- Register in `src/lib/email-templates/registry.ts` as `admin-access-granted`.

### Wiring to the role-change action

Create a small helper `src/lib/email/send.ts` (if not present from scaffold) that POSTs to `/lovable/email/transactional/send`. Then:

- **Admin roles page** (`/admin/roles`): after a successful "grant admin" insert into `user_roles`, call a new server function `sendAdminAccessGrantedEmail({ email, grantedByName })` that:
  - Runs behind `requireSupabaseAuth` + `has_role('admin')` check.
  - Enqueues the `admin-access-granted` template via `supabase.rpc('enqueue_email', ...)` with an idempotency key of `admin-access-${user_id}-${timestamp}`.
  - Returns `{ queued: true }`.
- Show a toast on success: "Confirmation email queued." Failure: inline error + retry (matches the pattern used in ClarificationModal/BookCallModal).

### One-off send now for `hello@trust-tai.com`

After the scaffold + template are in, trigger the same server function once for `hello@trust-tai.com` so the confirmation email you asked for is sent as part of this change.

## Notes

- No changes to auth email templates (out of scope).
- No marketing email surface added.
- DNS is already verified so emails should send immediately after scaffold deploys with the next preview build.
