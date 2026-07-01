## Goal

Replace the four placeholder portal routes with fully functional pages backed by existing tables (`client_portal_messages`, `client_portal_files`, `client_portal_billing`, `client_portal_projects`, `subscriptions`) and Supabase auth. All pages share the existing `PortalPage` shell (ivory canvas, ink sidebar) and use the editorial visual language from the uploaded references — adapted, not copied pixel-for-pixel.

## 1. Shared plumbing (`src/lib/portal.functions.ts`)

Add these `createServerFn` calls, all `.middleware([requireSupabaseAuth])` and scoped to the caller's project via `client_portal_permissions` (already used by `current_client_portal_project_id`):

- `getPortalContext()` → `{ project, permissions, profile }` — one call the shell can prime so every page shares project/phase info shown in the header strip.
- `listPortalMessages()` → messages for the active project where `visible_to_client = true`, ordered by `created_at desc`.
- `sendPortalMessage({ body, subject? })` → insert into `client_portal_messages` with `sender_type='client'`, `author_email=claims.email`, `visible_to_client=true`. (Distinct from the legacy `portal_messages` insert in `src/utils/portal.functions.ts`.)
- `listPortalFiles()` → files for active project where `client_visible = true AND is_internal = false`.
- `createPortalFileUploadUrl({ fileName, mimeType, sizeBytes })` → validate size/mime, call `storage.from('client-portal-files').createSignedUploadUrl(...)`, insert the `client_portal_files` row with `uploaded_by_role='client'`, return `{ signedUrl, token, path, fileId }`.
- `createPortalFileDownloadUrl({ fileId })` → signed GET URL, permission-checked.
- `getPortalBilling()` → latest `client_portal_billing` row + (if present) active `subscriptions` row for `claims.email`.
- `updatePortalProfile({ fullName, companyName?, role?, website?, industry? })` → upsert into `client_access` metadata JSON (no schema change; use existing `metadata` column pattern).

Each function returns `{ error }` on failure instead of throwing so the UI can render inline error state.

## 2. Messages — `src/routes/portal.messages.tsx`

Real inbox threaded by day. Layout:

- Left/main column: grouped-by-date list of `client_portal_messages` cards showing sender avatar (Trust Tai monogram vs. client initials), timestamp, subject, body, `Update` / `Your reply` badge, and any `related_file_ids` chips linking to `/portal/files`.
- Right rail (desktop only, hides <lg): conversation summary counts (updates, replies, open action items) derived client-side from the message list, plus "Attached files" (latest 3) and a help card.
- Composer pinned to bottom of the main column with a Textarea + Send button wired to `sendPortalMessage`; optimistic append via `useMutation` + `queryClient.invalidateQueries`.
- States: skeleton rows while loading; empty state ("No messages yet. Trust Tai will post updates here."); error state with retry that calls `router.invalidate()`.
- Tabs (All / Updates from Trust Tai / Your replies / Action items) filter the in-memory list.

## 3. Account — `src/routes/portal.account.tsx`

Two-column layout matching the reference:

- Main column
  - "Profile information" card: name, role, email (read-only), company, website, industry. Edit mode toggled by "Edit profile" button; save calls `updatePortalProfile`.
  - "Login & Security" card: login method (Magic link via email), last login (from `auth.users.last_sign_in_at` via `supabase.auth.getUser()`), active sessions count (1, current device), "Resend login link" button calling the existing `resendPortalWelcome` action.
  - "Notification preferences" card: three toggles (email updates, new messages, milestones). Persist to `client_access.notification_prefs` JSON via `updatePortalProfile`.
- Right rail
  - "Portal access" status card driven by `checkPortalAccess` (active/revoked badge, granted date from `client_portal_permissions.granted_at`, tied-to package from `client_portal_projects.package_name`).
  - "Need help" card + Quick actions list (Resend login link, Update email → mailto, Sign out of all devices → `supabase.auth.signOut({ scope: 'global' })`).

## 4. Files — `src/routes/portal.files.tsx`

- Header strip: search input, category filter, file-type filter, sort dropdown, list/grid toggle (grid = optional; ship list first).
- Recent files row: horizontally scrollable cards for the 4 most recent files.
- All files table: name (icon + title), category chip, uploaded by, date, size, download button, kebab menu (download + copy link). Download calls `createPortalFileDownloadUrl` then `window.open`.
- Right rail: upload dropzone (drag/drop + "Choose files" button) using the two-step signed-upload pattern (`createPortalFileUploadUrl` → `PUT` to signed URL → refetch list). Enforce 100 MB client-side. Categories list with counts + storage bar (sum of `size_bytes` / configured quota, e.g. 10 GB).
- States: skeleton table, empty state ("Nothing shared yet"), per-row upload progress, upload error toast, list error with retry.
- Only render the upload card when `permissions.can_upload_files` is true.

## 5. Billing — `src/routes/portal.billing.tsx`

- "Package summary" card: package cover (reuse `roadmap-hero-mountain` asset as the visual), package name from `client_portal_projects.package_name`, description, feature bullets from `client_portal_projects.metadata.features` (fallback to a hard-coded 4-bullet default), engagement status badge, current phase, next milestone.
- "Payment overview" strip: four tiles (status, amount paid, payment date, receipt link) sourced from `client_portal_billing`.
- "Invoice history" table: all `client_portal_billing` rows for the project.
- Right rail: "Next payment" card (one-time vs. recurring — check for a matching `subscriptions` row; if `subscription.status='active'` show next period end, else "No upcoming payments"), "Manage your billing" card with a button that calls the existing `createBillingPortalSession` server fn and redirects to the returned Stripe URL, "Questions about billing" help card.
- Footer strip: Stripe security notice.
- States: skeleton, empty ("No billing on file yet"), error with retry. Hide the whole page and show a graceful message when `permissions.can_view_billing` is false.

## 6. Data loading pattern

Every page follows the TanStack Query + loader pattern already used elsewhere:

```ts
loader: ({ context }) => context.queryClient.ensureQueryData(portalMessagesQueryOptions())
component: () => { const { data } = useSuspenseQuery(portalMessagesQueryOptions()); ... }
errorComponent: RetryError
```

Query keys: `['portal','messages', projectId]`, `['portal','files', projectId]`, `['portal','billing', projectId]`, `['portal','account']`.

## 7. Storage bucket

`client-portal-files` bucket already exists (private). Add RLS on `storage.objects` in a new migration allowing authenticated users to `SELECT`/`INSERT` objects whose `storage_path` maps to a `client_portal_files` row owned by their active project (via `current_client_portal_project_id()`). Signed URLs bypass RLS but still require the bucket policy for the initial upload token.

## Out of scope

- Real-time subscriptions (poll on tab focus via React Query's default `refetchOnWindowFocus`).
- Two-factor auth (surface as "Coming soon" per the reference).
- Grid view for files (list view only in v1).
- Editing/deleting messages after send.
