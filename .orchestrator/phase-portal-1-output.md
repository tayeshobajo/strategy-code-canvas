# Phase portal-1 — Client gallery + client portal (website side)

- `src/lib/client-roadmaps/registry.ts` — shared public registry (slug, route, client, headline, summary, cover).
- `src/routes/clients.index.tsx` — public `/clients` gallery, SEO + JSON-LD ItemList, CTA tracking.
- `src/components/clients/RoadmapDeckTracking.tsx` — page_view, content_read (50% + 30s active), cta_clicked per deck; no form values.
- All five deck routes mount deck tracking.
- `src/lib/sitemap-builder.ts` — `/clients` + every listed roadmap.
- Portal: `/portal` magic-link sign in (noindex), `_authenticated` gate, `/portal/roadmap`, `/portal/intake`, `/portal/activity`.
- Server fns in `src/lib/portal/portal.functions.ts`; Core delivery of portal questions in `portal.server.ts` (signed, idempotent).
- Migration applied through the approval gate: `client_roadmap_access`, `portal_questions` (RLS scoped to the caller's email/uid).

Core dependency: `source_type: "portal_question"` on the public intake receiver.
Access grants are inserted by Trust Tai staff into `client_roadmap_access`.
