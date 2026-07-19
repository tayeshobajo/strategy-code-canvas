# Spine Readiness Thesis Gate Fix Output

## Why the UI disagreed

The Project Spine banner was reading the Strategic Thesis gate directly, while the 14-check readiness evaluator did not include the thesis in the roadmap rationale check. At the same time, client acknowledgment was being treated as required even before a roadmap had been published to the client portal.

## Changed

- `src/lib/engine-spine-readiness-eval.functions.ts`
  - Roadmap readiness now requires an approved Strategic Thesis plus phase rationale.
  - Strategic Thesis approval is read from durable field truth, with a sidecar fallback.
  - Client acknowledgment now passes until a client roadmap is actually published, matching the contract wording “where required.”
- `src/lib/spine-contract.ts`
  - Renamed the roadmap readiness label so the blocker clearly points to Strategic Thesis when that is the real missing gate.

## Expected result

Cakepro should now show Strategic Thesis as the remaining readiness blocker instead of incorrectly pointing to client acknowledgment before portal publication.