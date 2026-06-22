# What We Build — Copy Refinements

All changes are copy-only in `src/routes/what-we-build.tsx`. No structural, layout, or styling changes.

## 1. Rename milestones for clarity

Update the eight milestone names in `MILESTONES` (and mirror the same names in `IL_LEFT` / `IL_RIGHT` so the Intelligence Layer diagram stays in sync):

| Current | New |
|---|---|
| Converting Website | Conversion-Focused Website |
| Connected CRM | Connected CRM *(unchanged)* |
| Lead Engine | Lead Capture Engine |
| Client Portal | Client Portal *(unchanged)* |
| AI Support Assistant | AI Sales & Support Assistant |
| Operating Dashboard | Operating Dashboard *(unchanged)* |
| Workflow Automation | Workflow Automation *(unchanged)* |
| Internal Tools | Internal Workflow Tools |

## 2. Add a concrete intro line under the hero

In the hero paragraph (line 378), prepend the suggested intro sentence so the page opens with a concrete capability list, then keeps the existing strategic framing:

> After the Roadmap, we build the systems inside it: the website, CRM, lead engine, client portal, AI assistant, dashboard, automation, and internal tools your business needs — in the right order.
>
> Everything we build sits inside your Roadmap, in the order the business calls for it. Each milestone removes friction, sharpens execution, and strengthens the position you are building toward.

## 3. Rewrite the Intelligence Layer section

In the Intelligence Layer section (lines 716–724):

- Headline: replace "One layer / reads all of it." with **"One layer turns the system into insight."**
- Supporting copy: replace the existing two-sentence paragraph with:
  > Every website, CRM, lead engine, portal, assistant, and dashboard creates signals. The intelligence layer helps the business see what is working, what is stuck, and what should happen next.

## 4. Refine the Intelligence Layer outcomes list

Update `IL_OUTCOMES` (lines 241–246):

| Current | New |
|---|---|
| Clarity | Clearer decisions |
| Decisions | Better lead visibility |
| Operational leverage | Operational leverage *(unchanged)* |
| Compounding position | Long-term business position |

## Out of scope

- The four principles row (Clarity / Sequence / Compounding / Ownership) and the per-milestone radar values reusing those four labels — keeping those untouched preserves the principle framing the user called out as working.
- SEO meta description on line 83 still references the eight builds generically; no rename needed there.
- No image, layout, animation, or component-structure changes.
