# Fidelity Decision Rubric

Use this reference when a mockup cannot or should not be matched exactly.

## Decision Modes

### Exact match

Use when the mockup is clearly approved, technically feasible, accessible, responsive, and aligned with the existing brand system.

Signals:
- User says the design is approved or locked
- Existing codebase has matching tokens/components
- Layout works across breakpoints
- No product logic is at risk
- Assets are available or clearly provided

### Brand-consistent interpretation

Use when the mockup direction is right but exact copying would create weak code, weak responsiveness, inconsistent brand expression, poor UX, or false precision.

Signals:
- Mockup is a screenshot or inspiration, not a final spec
- Assets are missing or low quality
- The reference uses different fonts/colors than the product
- Existing components already solve the pattern better
- Mobile behavior is not shown
- Exact measurements would fight the design system without improving quality

### Intentional improvement

Use when the mockup has a clear problem and the user wants the best decision, not blind obedience.

Signals:
- Poor contrast or accessibility
- Crowded layout or weak hierarchy
- Mismatched branding
- Unclear CTA priority
- Fragile or overcomplicated implementation
- Visuals that look good in a static screenshot but fail in the real product
- User asks to make it 10/10, premium, cleaner, sharper, more modern, or more aligned

## Priority Ladder

Pixel fidelity is the goal. These priorities define when and how to deviate from it. Never treat the lower rungs as permission to skip precision. They are guardrails for cases where exact matching would harm the product.

When values conflict, use this order:

1. Product correctness: data, forms, routing, auth, integrations, permissions
2. User comprehension: clear hierarchy, readable copy, obvious next action
3. Brand trust: consistent palette, typography, tone, and quality bar
4. Responsive integrity: desktop, tablet, mobile, and edge cases
5. Accessibility: semantic structure, keyboard access, contrast, focus states
6. Maintainability: reusable components, clean files, minimal duplication
7. Pixel fidelity: match exact measurements after higher priorities are safe

## Decision Language

Use calm, direct language:

- "I will match the visual hierarchy exactly, but adapt spacing tokens to the existing system."
- "I will not copy this shadow treatment because it conflicts with the current brand depth system. I will preserve the premium glass feel with the existing token set."
- "The screenshot does not show mobile. I will keep the same content priority and convert the grid into stacked cards below tablet width."
- "This reference is useful for mood, not structure. I will use it for atmosphere while preserving the current product layout."
- "The mockup shows an asset that is not available. I will mark the asset gap instead of substituting a random image."

## Verification Protocol

Perform side-by-side comparison at the relevant breakpoints. Use these defaults unless the project has different targets:

- Mobile: 375px
- Tablet: 768px
- Desktop: 1440px

At each breakpoint, check:

- Colors match exact extracted or system token values
- Font sizes, weights, and line-heights match the token block
- Spacing matches within 2px tolerance where exact values are possible
- Border radius and border width match the token block
- Shadows match offset, blur, spread, color, and opacity where specified
- Text content matches word for word unless intentionally changed
- Icons match type, size, color, and stroke/fill style
- Layout structure matches columns, alignment, stacking order, and content priority
- Hover/focus/active/loading/empty/error states are covered where relevant
- Known deviations are documented, not hidden

## QA Checklist

Before calling work complete, verify:

- The page still runs without console-breaking changes
- Existing data flows still work
- Desktop layout matches the design intent and extracted tokens
- Mobile layout is not an afterthought
- Main CTA and core task remain obvious
- Typography scale feels intentional
- Spacing is consistent and not guessed randomly
- Components are reused where possible
- No unrelated files were changed
- Any intentional differences are explained
