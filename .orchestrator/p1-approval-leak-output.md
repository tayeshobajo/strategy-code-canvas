P1 approval leak fix complete.

- `decideReviewItem` now keeps operator review access through `assertOps`, but official roadmap-version approval remains behind the existing admin-only approval gate.
- Version approval now requires an exact `engine_review_items.version_id` match scoped to the resolved `project_id`; the legacy label/most-recent fallback is removed.
- Missing, stale, already-approved, cross-project, or unlinked versions now fail before the review item/audit write, so no approval status or `approved_snapshot` lock can happen on an ambiguous target.
- `transitionDelivery` already gates `sent` and `execution` behind an admin role check and still requires a linked project with an approved snapshot.
- Updated guard tests for exact version matching and pre-write failure ordering.

Verification:
- `npx vitest run --config vitest.config.ts src/lib/__tests__/review-item-version-fk.test.ts src/lib/__tests__/decide-review-item-ordering.test.ts src/lib/__tests__/delivery-transition-gate.test.ts src/lib/__tests__/role-rejection-behavioral.test.ts` passed: 4 files, 27 tests.
- Targeted `npx eslint ...` was attempted, but the touched engine file has broad pre-existing Prettier violations outside this change set; the relevant Vitest guard suite is passing.
