# Roadmap parity + PDF + QA

## 1. Background image fidelity

`MapCanvas.tsx` currently darkens the map with a `#0b1220` container background and a top gradient overlay. Change to:

- Remove the `background: "#0b1220"` on the scroller.
- Remove the top gradient div; the reference image (Image 2) is meant to be shown as-is.
- Keep `object-cover` so it fills the 1800×1050 canvas.
- Add a fixed aspect frame (`aspect-[12/7]`) so the map scales identically at 1280/1440/1536/1920 without cropping vertically. Canvas width stays fixed; the outer container height derives from viewport width via `min-height` on the scroller so labels stay in the same relative spot.
- Re-tune overlay text drop shadows since the top gradient is gone (labels sit on brighter sky).

## 2. Visual regression for `/portal/roadmap`

Add `tests/visual/portal-roadmap.spec.ts` under the existing Playwright config:

- Auth: hit `/portal/roadmap` via the demo portal token flow already used in seed data (`scripts/portal/seed_demo_workspace.sql`). If the route requires a signed-in session that Playwright can't mint, fall back to a public preview route or a storybook-style harness page.
- Snapshot the full map region (`#portal-canvas-scroll` + overlay card + overview strip) at 1280, 1440, 1536, 1920.
- Store baselines under `tests/visual/portal-roadmap.spec.ts-snapshots/`.
- Reuse the 0.01 diff ratio threshold from `playwright.config.ts`.

Runbook: `bunx playwright test portal-roadmap --update-snapshots` after intentional design changes.

## 3. PDF that mirrors the on-screen roadmap

`src/lib/roadmap-pdf.ts` today writes plain jsPDF text and cannot express the map, overlays, phase pills, or milestone chips. Rewrite as a DOM-to-PDF pipeline:

- Add `html2canvas` (already used elsewhere in similar Lovable projects; verify or `bun add`).
- New helper `captureRoadmapPdf(el: HTMLElement, filename: string)`:
  - `html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" })`
  - Split into letter-sized pages (`jsPDF` `addImage` per slice) so long content flows.
- Wire the Download PDF button in `RoadmapHeader` to grab the roadmap section wrapper by id (`#portal-roadmap-print-root`) and call the helper. Keep the existing text-only export as a fallback under a hidden dev flag.
- Ensure fonts render: pass `letterRendering: true` and preload the display font before capture.

Trade-off (call out for the user): rasterized PDF = pixel-perfect but not selectable text. That is the only way to guarantee "pixel-perfect spacing relative to the on-screen version".

## 4. Header action QA

Manually drive each control via Playwright (headed script under `/tmp/browser/`) and screenshot:

- Fit to field → asserts `#portal-canvas-scroll.scrollLeft === 0` and canvas width fits viewport.
- Jump to Point A / Phase 1 / 2 / 3 / Point B → asserts scrollLeft matches expected band midpoint.
- View filter (All / Milestones / Decisions / Deliverables) → asserts dimmed markers count changes.
- Ask a question → opens `ClarificationModal`, submits, sees success state (already implemented earlier).
- Book next call → opens `BookCallModal`, submits, sees success state.
- Regression check: after each action, assert Executive Summary / Strategic Priorities / Risks / Recommended Next Move / Acknowledge Roadmap DOM subtree hashes are unchanged.

## Technical details

- Files touched: `src/components/portal/roadmap/MapCanvas.tsx`, `src/lib/roadmap-pdf.ts`, `src/routes/portal.roadmap.tsx` (add print root id + wire new PDF fn), new `tests/visual/portal-roadmap.spec.ts`, new `/tmp/browser/roadmap-actions/verify.py`.
- New dep: `html2canvas` (unless already present).
- No schema, no route, no auth changes.
- Untouched by contract: Executive Summary, Strategic Priorities, Risks & Dependencies, Recommended Next Move, Acknowledge Roadmap.

## Open questions

1. Snapshot auth: is the demo portal reachable without a live Supabase session in the sandbox, or should the visual test render a `?preview=demo` variant? I'll add a `__visual` query param that seeds the mock journey on the client so Playwright can hit it without auth — OK?
2. PDF: confirm rasterized (image-based) PDF is acceptable for pixel parity. The alternative is a hand-built vector layout that will always drift from the DOM.
