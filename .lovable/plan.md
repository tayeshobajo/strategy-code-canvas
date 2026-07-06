## Build Plan

**Reference intent:** Replace the generic Stripe-in-a-page checkout with a Trust Tai handoff flow — Begin The Walk → Confirming payment → You're in → Your portal is ready — that matches the four uploaded mockups and lands the client inside their portal without asking them to "check email and figure it out."

**Fidelity strategy:** Brand-consistent interpretation. Match the mockups' layout, hierarchy, typography rhythm, iconography, and copy. Keep Stripe's Embedded Checkout iframe intact (protected fields) but wrap it in the branded right-column shell shown in mockup 1.

**Reuse:**
- `SiteHeader`, `PaymentTestModeBanner`, existing tokens (`bg-background`, `text-ink`, `border-rule-soft`, `font-display`, `royal`), `Button`, shadcn primitives
- `StripeEmbeddedCheckout` (unchanged), `createCheckoutSession`, `getCheckoutSessionStatus`
- Webhook `src/routes/api/public/payments/webhook.ts` already creates `client_portal_projects`, `client_portal_permissions`, `client_portal_billing`, `client_access`, welcome email, activity log — this stays the source of truth
- `portal.home.tsx` provisioning surface

**Create / modify:**

Frontend (visual — this is the primary ask):
1. `src/routes/checkout.walk.$pace.tsx` — rewrite as two-column layout: left = Begin The Walk summary card (Selected Walk, Monthly investment, Timeline, What's included, What happens next, trust footer), right = branded shell around `StripeEmbeddedCheckout` with header ("Complete Your Investment", pace + monthly line, "Secure checkout" lock chip) and footer ("Secure payments powered by Stripe"). Extend `PACES` map with `monthly`, `timeline`, `pointBLabel`, `included[]` fields feeding both columns.
2. `src/routes/checkout.processing.tsx` — new. "Confirming your payment." full-page state (mockup 3). Static SVG route + progress-dot component (Payment → Verification → Workspace → Access), poll `getCheckoutSessionStatus` every 2s; on `paid`, replace to `/checkout/return`. Reached only if Stripe posts back before the webhook lands.
3. `src/routes/checkout.return.tsx` — rewrite `Success` into mockup-2 layout: left column "PAYMENT RECEIVED / You are in. / The Roadmap starts now." with primary CTA `Create my portal account` → `/checkout/activate?session_id=…`; right column confirmation card (pace, monthly, timeline, Confirmed pill, billing email, payment status band). Keep `Cancelled` / `Pending` / `Recovery` / `NoSession` states, restyled to match. If webhook hasn't landed yet, CTA reads `Preparing your portal…` and polls.
4. `src/routes/checkout.activate.tsx` — new. Mockup-4 "Your portal is ready." state: step rail (Checkout → Thank You → Account Created → Signing you in), calls new `startPortalSignIn` server fn, sets session, redirects to `/portal/home`. On failure shows "For security, we need to send you a fresh sign-in link" with `Send Sign-In Link` CTA (existing `resendPortalWelcome`).
5. `src/routes/portal.home.tsx` — add a `workspace_provisioning` variant using the existing `portal_status` field: hero copy "Welcome to your Trust Tai workspace. / We're preparing your Roadmap environment." with step chips (Access confirmed / Workspace created / Roadmap being prepared / Engagement begins) plus the current action tiles. No layout regression for existing statuses.

Backend (thin — infra already exists):
6. `src/lib/portal-activation.functions.ts` — new. `startPortalSignIn({ sessionId })`:
   - Fetch Stripe session via `createStripeClient` + `getCheckoutSessionStatus` pattern, read `customer_details.email` (fail if unpaid).
   - Verify `client_portal_permissions` row exists for that email (proves webhook has run — if not, return `{ status: 'provisioning' }` so the UI can keep polling).
   - `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${origin}/portal/home` } })`.
   - Return `{ status: 'ready', actionLink }`; client `window.location.replace(actionLink)` to establish the Supabase session, which redirects onward to `/portal/home`.
   - Existing users: `generateLink` no-ops user creation and just issues a link — dedup handled implicitly. Webhook's `upsertPortalProject` already attaches new subscriptions to existing projects by `primary_email`.
7. No DB migration. All required tables exist; webhook already writes `portal_status: 'payment_confirmed'` which portal home will treat as provisioning until an operator advances it.

**Do not touch:** webhook handler logic, Stripe server functions, `payments.functions.ts`, portal RLS, auth middleware, `SiteHeader`, `investment.tsx` pace list, `walks.tsx`.

**Design tokens (extracted from mockups):**
- Colors: cream page `bg-background` (existing), card `bg-card` + `border-rule-soft`, primary CTA solid `#0A1533`-ish (existing `bg-ink`), accent royal blue for links / step highlights (`text-royal`), success green pill (`bg-emerald-100 text-emerald-700`), verification blue dashed line (`border-royal/40`)
- Typography: display serif for H1s (`font-display font-light`, ~44/52px desktop, 32px mobile), sans body (`text-ink/70`, 15–16px), uppercase mono eyebrows (`font-mono text-[10px] tracking-[0.24em] uppercase text-royal`)
- Spacing: page `py-16 sm:py-20`, two-col `grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-8`, cards `p-8 sm:p-10 rounded-2xl`, section rhythm 8px base
- Geometry: cards `rounded-2xl`, buttons `rounded-full`, icons 16–20px in soft-blue circular chip `bg-royal/10`
- Effects: soft shadow `shadow-[0_8px_40px_-16px_rgba(23,28,56,0.08)]`, no heavy elevation; dashed connector lines for step rail; no spinners — use static route/checkmark states

**Component map:**
```
BrandedCheckout (route)
├─ WalkSummaryCard (left)
│  ├─ SelectedWalkRow, InvestmentRow, TimelineRow
│  ├─ IncludedList
│  └─ WhatHappensNext (numbered chips)
└─ BrandedPaymentPanel (right)
   ├─ PanelHeader (title + Secure chip + pace line)
   ├─ StripeEmbeddedCheckout (unchanged)
   └─ PanelFooter (Stripe mark + Terms/Privacy)

CheckoutProcessing (route) — StepRail + RouteLine
CheckoutReturn (route) — SuccessLayout | CancelledLayout | PendingLayout | RecoveryLayout
CheckoutActivate (route) — StepRail + ProvisioningCard + FallbackLinkCard
PortalHome — adds ProvisioningHero when portal_status='payment_confirmed'
```

**Asset inventory:** No new binaries. Use `lucide-react` icons (`Lock`, `Footprints`, `Check`, `CreditCard`, `User`, `MapPin`, `ShieldCheck`, `ArrowRight`) and inline SVG for the dashed route line. Trust Tai logo already lives in `SiteHeader`. Client-logo strip in mockup 1 uses the existing `ClientMarquee` component.

**Responsive plan:** Mobile 375px — single column, right panel first (payment is the action), left summary collapses to a compact recap card above it. Tablet 768px — same stack but wider cards. Desktop 1440px — the exact two-column layout from mockup 1. Step rails wrap to a vertical variant under 640px.

**Risks / assumptions:**
- Auto sign-in depends on `supabaseAdmin.auth.admin.generateLink` — assumed available on this Supabase project (standard). Fallback path shown in the mockup handles failures gracefully.
- Webhook-vs-redirect race: browser can arrive at `/checkout/return` before the webhook runs. `checkPortalReady` polls `client_portal_permissions` by email; UI holds on "Preparing your portal…" until permission row exists, then unlocks the Create-account CTA. No new state machine — driven entirely by existing rows.
- `portal_status='payment_confirmed'` currently just renders normal home; the new provisioning hero treats it as "not yet advanced by an operator," which is accurate today. Operators moving the status to a later value hides the hero.
- No changes to what the webhook creates — the "backend requirements" in the prompt map 1:1 to what the current webhook already does; adding more would duplicate.

Files changed (final list): `src/routes/checkout.walk.$pace.tsx`, `src/routes/checkout.return.tsx`, `src/routes/checkout.processing.tsx` (new), `src/routes/checkout.activate.tsx` (new), `src/routes/portal.home.tsx`, `src/lib/portal-activation.functions.ts` (new).