## Goal

Rebuild `/portal/home` (and share the same shell with `/portal/onboarding` and `/portal/access-denied`) around the selected "Premium editorial" direction so the sidebar, main card, and footer read as one system.

## What changes

### 1. Portal shell (`src/routes/portal.tsx` + `src/components/portal/PortalPage.tsx`)

- Drop the top `SiteHeader`; the sidebar becomes the sole chrome inside the app frame.
- Two-region layout: `<aside>` (ink sidebar) + `<main>` (ivory canvas). Below both, one shared ink footer band. No white gap between sidebar and footer — the ink color continues straight down.
- Sidebar refinements:
  - Compact 256px width, `bg-ink` with `border-r border-white/5`.
  - Logo lockup at the top (existing Trust Tai logo asset) + small "Client Portal" eyebrow.
  - Active nav item: `bg-royal/10` text-white with a 2px left border in royal blue. Inactive: slate-400 hover white.
  - Sign-out block stays pinned at the bottom with a `border-t border-white/5` divider.
- `PortalPage` becomes a single centered container (`max-w-3xl`) with generous vertical padding, so every portal page uses the same rhythm.

### 2. Pending-workspace card (`src/routes/portal.home.tsx` → `PendingWorkspacePanel`)

Replace the current stacked card with an editorial three-part card:

- Header block (p-10): pulsing royal dot + eyebrow "Workspace setup in progress", Cormorant Garamond H1 "Welcome back, {name}. We're preparing your environment.", intro copy.
- Stepper (p-10, absolute vertical hairline behind circles):
  1. Access confirmed — filled royal circle with check.
  2. Workspace being created — white circle, 2px royal border, royal "2", sub-copy "Estimated turnaround: one business day.".
  3. Roadmap published — muted circle "3".
  4. Engagement begins — muted circle "4".
- Action bar (p-8, `bg-paper-soft` top-border): primary "Resend sign-in link" (ink bg) + secondary "Contact Tai" (white with border).

Keep the existing correlation-id logging, `resendPortalWelcome` action, and toast behavior — only the presentation changes.

### 3. Footer band

- Replace the current `SiteFooter` inside portal routes with a slimmer variant matching the direction: ink background, 4-column grid (Trust Tai lockup + tagline, Navigate, Connect, Start CTA), hairline top border, muted uppercase column labels.
- Reuse existing footer link data from `SiteFooter` so nothing goes missing; this is a visual reskin only.

### 4. Applied across portal routes

- `/portal/home` — new pending-workspace card + existing hydrated dashboard reskinned to the same card language (ivory canvas, elevated white card, ink header type).
- `/portal/onboarding` and `/portal/access-denied` — inherit the shared `PortalPage` container and matching footer so they visually belong to the same system.

### 5. Tokens

Add two helpers to `src/styles.css` under `@theme` (no palette changes):

```css
--color-paper-soft: oklch(0.985 0.004 90);   /* card action-bar bg */
--color-rule-soft: oklch(0.92 0.005 90);     /* card border */
```

All other colors reuse existing `ink`, `royal`, `paper`, `muted` tokens.

## Out of scope

- No changes to auth, magic-link server functions, sidebar route list, or copy on other portal pages beyond what's needed to fit the shared container.
- Email templates untouched.
