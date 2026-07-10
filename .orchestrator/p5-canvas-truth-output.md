## P5 Canvas Truth Fix

Completed the client-facing canvas rendering fixes:

- `MapCanvas.tsx` now renders Point A and Point B through data-driven cards using `journey.pointA` / `journey.pointB`, including the authored detail and a neutral empty state when detail is absent.
- Long Point A/B detail is no longer destructively truncated. Desktop and mobile cards clamp only in the collapsed state and expose an accessible "Show full point" toggle.
- `MobilePhaseStack.tsx` always includes Point A and Point B, matching the desktop treatment instead of omitting missing-detail points.
- Existing route/publish code already used journey phase labels and engine-authored Point A/B precedence; guard tests now also cover expandable Point A/B rendering.

Verification:

- `npm test -- src/lib/__tests__/roadmap-canvas-truth.test.ts` passed: 18 tests.
- `npx eslint src/components/portal/roadmap/MapCanvas.tsx src/components/portal/roadmap/MobilePhaseStack.tsx src/lib/__tests__/roadmap-canvas-truth.test.ts` passed with one pre-existing hook dependency warning in `MapCanvas.tsx`.
- `npm run build` did not complete because the existing Nitro/TanStack build fails on `getScriptPreloadAttrs` not being exported by `@tanstack/router-core`. This appears unrelated to the canvas changes.
