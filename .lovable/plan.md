# Typo + em-dash cleanup across all pages

Scope: `/` (index), `/about`, `/investment`, `/what-we-build`, plus shared components (`SiteHeader`, `TrustTaiLogo`, footer). Code comments are out of scope.

## 1. Remove em-dashes (—) from user-facing text

I found 34 em-dashes across the codebase. The user-facing ones I'll replace using context-appropriate punctuation (mix, my judgment):

**Page titles / OG titles** (use a pipe, standard convention):
- `Trust Tai — The Business Operating Roadmap` → `Trust Tai | The Business Operating Roadmap`
- `About — Trust Tai` → `About | Trust Tai`
- `Investment — Trust Tai` → `Investment | Trust Tai`
- `What We Build — Trust Tai` → `What We Build | Trust Tai`
- `Trust Tai — Consultancy + AI Agency` (logo alt) → `Trust Tai | Consultancy + AI Agency`

**Body copy / meta descriptions / alt text** (comma, period, or parenthetical depending on flow). Examples:
- "where it needs to be — and build the first leg…" → "where it needs to be, and build the first leg…"
- "carry this roadmap into the future — with or without us." → "carry this roadmap into the future, with or without us."
- "Less hunting, more harvesting — the pipeline becomes a function…" → "Less hunting, more harvesting. The pipeline becomes a function…"
- "self-serve answers, status, and access — and where the founder…" → "self-serve answers, status, and access, and where the founder…"
- "a careful operating system for businesses…" (keep flow with comma)
- "lit by soft natural light — the standard that started Trust Tai." → "lit by soft natural light. The standard that started Trust Tai."
- "Founders we partner best with — people who choose becoming…" → "Founders we partner best with: people who choose becoming…"
- "We value what matters — not what's loud." → "We value what matters, not what's loud."
- "If that's how you build — let's build your Roadmap." → "If that's how you build, let's build your Roadmap."
- "the three walks — named before…" → "the three walks, named before…"
- "Bridge spanning a river — where most firms start…" → "Bridge spanning a river, where most firms start…"

**Out of scope:** em-dashes inside JSX comments (`{/* … */}`), TS `@ts-expect-error` comments, and `src/routes/README.md` (internal doc) stay as-is.

## 2. Typo pass

I'll read every user-visible string block in:
- `src/routes/index.tsx` (hero, roadmap labels, walks, FAQ, CTA, footer copy)
- `src/routes/about.tsx` (all six narrative sections + CTA)
- `src/routes/investment.tsx` (intro, pricing tiers, three walks, included/excluded lists, FAQ)
- `src/routes/what-we-build.tsx` (problem statements, outcomes, timeline, CTA)
- `src/components/SiteHeader.tsx` (nav labels)

For each file I'll check for: misspellings, wrong homophones (its/it's, your/you're), doubled words ("the the"), stray punctuation, mismatched capitalization in headings, and inconsistent product naming (Roadmap vs roadmap, Trust Tai vs TrustTai). Fixes will be applied with targeted `line_replace` edits so unrelated copy and animations stay untouched.

## 3. "Little issue"

You didn't share what the little issue is. I'll ship the typo + em-dash cleanup first; please describe (or screenshot) the issue in your next message and I'll address it in the same pass before you review.

## Out of scope

- No layout, color, animation, or component-structure changes.
- No copy rewrites beyond fixing errors and removing em-dashes.
- README and code comments untouched.
