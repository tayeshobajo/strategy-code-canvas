## Goal

Let anyone with portal or staff access sign in with an email + password instead of (or alongside) the current magic-link flow, reset a forgotten password by email, and change their password from the account page.

## What already exists

- `/portal/account` already has a working "Set / update password" form (`supabase.auth.updateUser`). No change needed there beyond a small "Change password" link surfaced from the account menu.
- Two magic-link sign-in surfaces: `/auth` (used by staff + portal) and `/portal/login` (portal-focused). Both call `requestPortalMagicLink`.

## Changes

### 1. Add password sign-in to both sign-in pages

On `/auth` and `/portal/login`, keep the magic-link path but add:

- Password input (with show/hide toggle)
- Primary button: **Sign in** → `supabase.auth.signInWithPassword({ email, password })`
- Secondary link: **Email me a sign-in link instead** (falls back to existing magic-link flow)
- Link: **Forgot password?** → `/forgot-password`

Post-sign-in navigation reuses the existing `onAuthStateChange` staff-vs-portal routing already in `/auth`. `/portal/login` gets the same listener so password sign-in lands correctly.

Error handling: show Supabase's `Invalid login credentials` message inline; if the account has no password set yet, show "No password set for this email — use the sign-in link, then set a password on your account page."

### 2. Forgot password flow

New public route `/forgot-password`:

- Email input → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`
- Always show the same neutral success message (no user enumeration).

New public route `/reset-password`:

- SSR off. On mount, check `supabase.auth.onAuthStateChange` for `PASSWORD_RECOVERY` (Supabase auto-exchanges the recovery link hash into a session).
- If in recovery session: show "New password" + "Confirm password" form → `supabase.auth.updateUser({ password })` → on success, sign out, redirect to `/auth?email=…` with a "Password updated — sign in" flash.
- If not in a recovery session: show "This reset link is invalid or expired" + link back to `/forgot-password`.

Both routes are outside `_authenticated` (must be reachable when signed out) and marked `noindex`.

### 3. Account page tweak

`/portal/account` password form stays as-is. Add a small "Change password" anchor in the account nav that scrolls to that section (cosmetic only — no logic change).

### 4. Auth emails

Password reset uses the existing Supabase `recovery` email template already scaffolded under `auth-email-hook`. No new template needed; verify the recovery template's link points to `/reset-password` (it uses the redirect URL passed to `resetPasswordForEmail`, so nothing to change in the template file itself).

## Non-goals

- No new sign-up form. Password is still only settable by users who already have portal or staff access.
- No changes to RLS, tables, or server functions.
- No changes to Google OAuth or the magic-link server function.

## Files

- Edit: `src/routes/auth.tsx`, `src/routes/portal.login.tsx`
- Create: `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`
- Minor edit: `src/routes/portal.account.tsx` (add "Change password" anchor in nav)
