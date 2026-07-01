# Trust Tai Client Portal Plan

## What I will build

### 1. Portal access model and backend rules
- Add dedicated portal tables for:
  - client portal projects
  - onboarding data
  - messages
  - files metadata
  - activity log
  - billing snapshot rows
  - permissions/access state
  - approved roadmap publication records
- Reuse and extend existing data where it already fits:
  - `client_access` remains the payment-gated access source of truth
  - existing orders/subscriptions remain the Stripe-linked payment history
  - existing roadmap documents/review data become the initial approved-roadmap source
  - existing portal messages can be bridged or superseded with scoped portal messaging
- Add strict row-level rules so clients only ever see their own portal project and client-safe records.
- Keep internal notes, review artifacts, draft roadmap data, ops-only fields, and internal files separated from client-facing queries.

### 2. Stripe-to-portal activation flow
- Extend the existing Stripe webhook flow so successful payment:
  - grants portal access idempotently
  - creates or updates the client portal project
  - stores Stripe linkage fields
  - sets initial portal status
  - logs activity
  - triggers the welcome access email
- Ensure duplicate Stripe events do not create duplicate portal records.
- Keep access tied to purchaser email and confirmed payment only.

### 3. Magic-link portal login and route protection
- Reuse the existing auth system.
- Build `/portal/login` as a premium portal-specific experience.
- After login, check portal access before allowing entry.
- If the email has no active access, show the calm no-access message instead of exposing any portal content.
- Add a dedicated authenticated portal layout for `/portal/*` with:
  - deep navy sidebar
  - warm off-white shell
  - cream cards
  - premium top bar
  - no marketing footer
- Add admin-only protection for `/admin/client-portals/*` using the allowlist you gave: `hello@trust-tai.com`.

### 4. Shared portal shell and design system
- Create a reusable portal app shell for all client routes with:
  - sidebar nav
  - help card
  - client identity block
  - top status bar with current phase, package, status, and primary CTA slot
- Match the approved mockup direction across all portal pages:
  - editorial serif headings
  - calm spacing rhythm
  - restrained motion
  - soft gold and electric blue accents
  - reassuring copy

### 5. Client-facing portal routes
Build these routes and their required v1 states:

- `/portal/home`
  - paid + onboarding pending
  - onboarding complete + roadmap in progress
  - roadmap approved + ready
- `/portal/onboarding`
  - multi-section paid onboarding
  - save and continue
  - autosave
  - progress tracker and completion state
  - assets/docs upload step
- `/portal/roadmap`
  - roadmap not ready state
  - approved roadmap state only
  - acknowledge roadmap action logging
- `/portal/files`
  - empty state
  - files available state
  - client upload support scoped to the client project
- `/portal/messages`
  - updates/replies state
  - empty state
  - lightweight reply composer with activity logging
- `/portal/billing`
  - one paid invoice state
  - no upcoming payments state
  - Stripe-hosted billing links where available
- `/portal/account`
  - active access state
  - profile, notification, and access summary

### 6. Internal admin manager routes
Build the internal control surface at:
- `/admin/client-portals`
  - client list / portal index
- `/admin/client-portals/$id`
  - client summary
  - onboarding progress
  - recent activity
  - recent deliverables
  - quick actions
  - internal notes
- `/admin/client-portals/$id/roadmap-builder`
  - internal-only roadmap builder shell
  - milestone/timeline/dependency structure
  - internal controls not visible to clients

### 7. Storage and file visibility model
- Add a private storage bucket for client portal files.
- Enforce file visibility by portal project and visibility flags.
- Default client uploads to `Client Uploads`.
- Prevent draft/internal-only assets from appearing in client routes.
- Track file metadata separately from stored objects.

### 8. Activity logging and cross-page behavior
- Log the important client and admin lifecycle events you listed.
- Surface selected safe activity on client Home and Messages.
- Surface full activity in the internal manager.
- Wire the primary CTA on Home from current portal status and pending client actions.

## Technical approach
- Use database migrations for the new portal schema, RLS, helper functions, and any triggers.
- Reuse TanStack Start server functions for app-internal reads/writes.
- Keep the Stripe webhook at the existing public payments route and extend it rather than replacing it.
- Reuse existing auth middleware and magic-link infrastructure.
- Create dedicated portal/admin route groups and shared layout components.
- Use existing roadmap review data as the approved client roadmap source in v1, while keeping the new internal roadmap builder as the admin workspace.
- Preserve existing public site behavior and keep portal styling isolated from the marketing site.

## Delivery order
1. Schema + access model
2. Webhook activation + welcome flow
3. Portal login + protected shells
4. Client routes with seeded/live states
5. Internal admin manager
6. File storage + uploads
7. Approved roadmap publishing bridge
8. Validation pass for access separation, idempotency, and route states

## Key guardrails
- No public signup
- No portal access before confirmed payment
- Client sees only their own data
- Admin-only routes remain separate
- Approved roadmap only on client side
- Drafts and internal notes never leak into client pages
- Stripe billing management stays hosted where possible