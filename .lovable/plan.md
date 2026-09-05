# Client roadmaps, gallery and portal on trusttai.com

## What we are building

Today each client roadmap is a hand-built page (`/clients/rollick`, `/clients/epay`, `/clients/pttanywhere`, `/clients/shugarshack`, `/clients/spartan`). They are beautiful, but they are invisible to the rest of the system: nothing records who visited, nothing links a deck to the intake it produced, and clients have no place to come back to.

This plan adds four things, in order:

1. **One place that knows every roadmap** — a single registry of client decks, so the site, the gallery, tracking and the portal all read the same truth.
2. **A public roadmap gallery** at `/clients` — every roadmap with a one-line summary and a link, fully indexed for search and shareable.
3. **Tracking on every deck** — page views, section reads and button clicks flow into Trust Tai Core, so we can see which roadmap drives which intake.
4. **A private client portal** at `/portal` — each client signs in with their email, sees their own roadmap, and can ask questions or submit an intake that lands in Core against their name.

Trust Tai Core (cmd.trusttai.com) is a separate application. This plan builds the website half and calls Core's existing signed public endpoints. Where Core needs a new endpoint, it is listed explicitly at the end as a requirement for that team, and the website ships a working fallback until it exists.

## Decisions made

- **Sign-in is a magic link by email.** No passwords for founders. A client can only see a roadmap their email is granted.
- **Gallery is public and indexed** by default, with a per-client "private" flag so an unlisted deck stays out of the gallery and out of the sitemap while its direct link still works.
- **The portal shows the existing deck** as the roadmap, plus live status from Core once Core exposes it. The deck stays the narrative; Core supplies current state.
- **No client data on the deck pages.** Public decks stay public and anonymous; anything client-specific lives behind sign-in.

## Stage 1 — Roadmap registry

A single source of truth listing each roadmap: slug, client name, headline, one-paragraph summary, cover image, publish date, listed/unlisted, and the emails allowed to see it in the portal.

Public fields (name, summary, cover) are safe for the gallery. Access emails are read server-side only.

## Stage 2 — Public gallery at `/clients`

- Card grid of every listed roadmap: cover, client name, one-line summary, link.
- Its own title, description, Open Graph and Twitter metadata, plus a generated cover image.
- Added to the sitemap alongside each listed roadmap page; unlisted ones excluded.
- Same header, footer and roadmap invitation widget as the rest of the site.

## Stage 3 — Deck tracking into Core

Each client deck emits the same small vocabulary already used elsewhere on the site, tagged with the roadmap slug so Core can attribute intake back to a deck:

- `page_view` — once per real route visit, deduplicated.
- `content_read` — after 50% of the deck and 30 seconds of active time.
- `cta_clicked` — Book a call, Build Your Roadmap, portal sign-in.
- `contact_clicked` — mail and phone links.

Nothing sensitive is sent: no form values, no answer text, no personal detail. Signing stays server-side using the existing website secret.

## Stage 4 — Client portal at `/portal`

- `/portal` — sign-in by email. Enter email, receive a link, land signed in.
- `/portal/roadmap` — the client's own roadmap: the deck framed inside the portal, plus their current milestones and status once Core supplies them.
- `/portal/intake` — a short question and request form. Submissions are signed and sent to Core against that client's record, with the same delivery guarantees as the public intake (retry, idempotency, confirmation email).
- `/portal/activity` — a plain list of what the client has submitted and what came back.

Access rule: a signed-in email only ever sees roadmaps its address is granted. Every read and write is checked on the server, not just hidden in the interface.

## Technical notes

- **Registry**: `src/lib/client-roadmaps/registry.ts` (public fields) plus a `client_roadmap_access` table (slug, email, granted_at) with RLS and grants; access rows read only through server functions.
- **Gallery**: `src/routes/clients.index.tsx` with `head()` metadata; `sitemap[.]xml.ts` extended to emit listed roadmap URLs.
- **Tracking**: reuse `src/lib/website-intake/track.ts` and `use-content-read.ts`; add a `RoadmapDeckTracking` wrapper mounted by each `clients.*.tsx` route, passing `properties: { roadmap_slug }`. Events flow through the existing `website_event_outbox` and signed `events.server.ts` delivery.
- **Auth**: Lovable Cloud magic link (`signInWithOtp`) with `emailRedirectTo` on a public callback route; portal routes live under `src/routes/_authenticated/portal.*`. Server functions use `requireSupabaseAuth`; `src/start.ts` already attaches the bearer token.
- **Portal intake**: new `src/lib/portal/intake.functions.ts` thin wrappers over a server-only module that reuses `core-client.server.ts` `postSigned` with a `source_type: "portal_question"` body; idempotency key per submission.
- **Core dependencies** (requirements for the Core team, each with a website fallback):
  1. `GET /api/public/website/roadmap-status?slug=` — milestones and current state for a client roadmap. Fallback: portal shows the deck only.
  2. Accept `source_type: "portal_question"` on the existing intake receiver. Fallback: queue in the outbox and retry.
  3. Accept `roadmap_slug` in event `properties` (already permitted by the current contract).
- No schema migration is applied without approval; the access table SQL goes to `.orchestrator/PENDING_MIGRATIONS.md` first per repo rules.

## Order of work

Stage 1 and 2 first (visible value, no dependencies), then Stage 3 (tracking, small and safe), then Stage 4 (portal, the largest piece). Each stage ends with a typecheck, a live browser check and a publish.
