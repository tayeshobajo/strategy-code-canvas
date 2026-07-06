---
name: mockup-to-build-precision
description: convert screenshots, mockups, figma references, uploaded designs, or existing page screenshots into high-fidelity frontend implementation plans and code changes. use when building from a visual reference, matching an approved design, fixing visual drift, or translating brand-consistent UI direction into an existing codebase for trust tai or client work.
---

# Mockup to Build Precision

## Purpose

Use this skill to turn a visual reference into a disciplined frontend build without blind copying or design drift. Optimize for brand-consistent interpretation when exact matching is impossible, while preserving product logic, codebase conventions, and user experience quality.

## Operating Principle

Treat the mockup as the north star, not a prison. Match the intent, hierarchy, proportions, rhythm, and brand feeling. Pixel fidelity is the goal. These priorities define when and how to deviate from it. Never treat product, brand, accessibility, responsiveness, or maintainability concerns as permission to skip precision. Use them as guardrails for cases where exact matching would harm the product.

## Required Workflow

### 1. Identify the source of truth

Before coding, determine what is being matched:

- Uploaded mockup, screenshot, Figma frame, design image, or existing approved page
- Target route, component, or screen to update
- Brand/client context, if provided
- Required behavior, data dependencies, forms, routing, auth, Supabase, or integrations
- What is locked versus what may be improved

If the target page or reference is ambiguous, ask one concise clarification. If enough context exists, proceed with stated assumptions.

### 2. Inspect before building

Review the reference and extract:

- Page sections and hierarchy
- Grid, columns, alignment, spacing rhythm, and visual density
- Typography scale, font weights, line heights, and text hierarchy
- Color palette, surfaces, borders, shadows, radii, and dividers
- Buttons, inputs, cards, badges, tabs, drawers, tables, and empty states
- Imagery, icons, background treatments, gradients, and overlays
- Interaction states, motion cues, hover/focus states, and loading states
- Desktop, tablet, and mobile implications

Then inspect the current codebase for:

- Existing routes and page structure
- Reusable components that should be preserved
- Existing design tokens, CSS variables, Tailwind config, theme files, or shared styles
- Existing data flow, hooks, forms, API calls, auth, permissions, and integrations
- Nearby pages that define the product's current visual language

Do not create new patterns until existing ones have been checked.

### 3. Produce the required precision artifacts before coding

Before changing code, produce these artifacts. For tiny fixes, keep them compact. For full-page builds, make them specific enough that another developer could follow them.

#### Design token block

Capture every extracted value that will guide implementation:

- Colors: exact hex, rgba, gradient stops, opacity, surface, text, border, shadow, and accent values
- Typography: family, size, weight, line-height, letter-spacing, text transform, and hierarchy level
- Spacing: base unit, padding, gap, margin, section spacing, card spacing, and vertical rhythm
- Geometry: radius, border width, container max-width, grid columns, card width, icon size, and image ratio
- Effects: shadow offset, blur, spread, color, opacity, backdrop blur, transition duration, easing, and animation notes

The token block is the implementation source of truth. No new value should appear in code unless it traces to this block, the existing design system, or an explicitly explained decision.

#### Component map

For full-page builds or substantial UI changes, document:

- Component tree using parent to child hierarchy
- Named components in PascalCase
- Props for reusable components
- States for default, hover, focus, active, disabled, loading, empty, and error where relevant
- Existing components that map to mockup sections
- New components that are truly required

#### Asset inventory

Identify every image, logo, icon, illustration, background, texture, or media element:

- Images: flag required source, dimensions, crop behavior, alt text, and context. Do not substitute random stock photos.
- Icons: identify the icon set when possible. Use the closest match from available libraries only after checking existing icon usage.
- Illustrations: flag for generation or sourcing with a clear style description.
- Logos: note exact files needed. Do not recreate logos from scratch.
- Missing assets: leave a clearly marked gap, use a neutral placeholder only when necessary, and surface the gap to the user.

### 4. Produce a build plan before coding

Always provide a concise build plan before changing code. Include:

1. What the reference is asking for
2. What will be reused
3. What will be created or modified
4. What will not be touched
5. The fidelity strategy: exact match, brand-consistent interpretation, or intentional improvement
6. Design token block summary
7. Component map summary
8. Asset inventory and missing assets
9. Risks, assumptions, or implementation tradeoffs
10. Mobile/responsive plan

For small visual fixes, keep this short. For full pages, make it specific enough that another developer could follow it.

### 5. Build in controlled passes

Implement in this order:

1. Structure and semantic layout
2. Component reuse and extraction
3. Desktop layout fidelity
4. Typography, colors, surfaces, spacing, and polish
5. Responsive behavior
6. States, interactions, data, and empty/loading/error views
7. Motion and animation only after the layout is stable
8. Cleanup and QA

Avoid large unrelated refactors. Touch only the files required for the requested build unless a shared component or token must be updated.

### 6. Apply the decision rubric

Use `references/fidelity-rubric.md` when deciding whether to match the mockup exactly, improve it, or adapt it to the brand/codebase.

Default decision order:

1. Preserve product correctness and user trust
2. Preserve brand consistency
3. Preserve visual hierarchy and design intent
4. Preserve codebase conventions and reusable components
5. Preserve pixel-level fidelity where practical

Never sacrifice working product logic for surface-level resemblance.

### 7. Verify with teeth

Before calling the work complete, compare the build against the reference at the relevant breakpoints. Use these defaults unless the project has different targets:

- Mobile: 375px
- Tablet: 768px
- Desktop: 1440px

At each breakpoint, verify:

- Colors match exactly where extracted values are available
- Font sizes, weights, and line-heights match exactly where specified
- Spacing matches within 2px tolerance where exact matching is possible
- Border radius and border width match exactly where specified
- Shadows match offset, blur, spread, color, and opacity where specified
- Text content matches word for word unless copy changes were requested
- Icons match type, size, color, and stroke/fill style as closely as possible
- Layout structure matches columns, alignment, stacking order, and content priority
- Hover, focus, active, loading, empty, and error states are handled where relevant
- No known deviations remain unexplained

If browser screenshots, visual diff tooling, or preview inspection are available, use them. If they are not available, state what was verified through code inspection and what still needs human visual review.

## Non-Negotiable Rules

- Do not redesign unless the user asks for improvement or the mockup conflicts with brand, UX, accessibility, responsiveness, or product logic.
- Do not blindly copy if a better decision is obvious. Explain the decision briefly and proceed.
- Do not invent a new style system when tokens/components already exist.
- Do not duplicate components if a reusable component exists.
- Do not break routing, auth, forms, Supabase, API calls, state logic, or permissions for visual changes.
- Do not call a build complete until desktop and mobile have both been considered.
- Do not ignore spacing, alignment, font sizing, contrast, or visual hierarchy.
- Do not replace brand direction with generic SaaS UI.
- Do not use placeholder content when real copy/data already exists, unless the user explicitly asks for examples.
- Do not hide uncertainty. Surface missing assets, unclear interactions, and implementation tradeoffs.

## Common Failure Modes

Check these specifically because AI builders often miss them:

- Button padding wrong because framework defaults override mockup values
- Input height too short because default component libraries compress form controls
- Border color slightly off because 1px borders are sensitive to hex drift
- Shadow too heavy because framework shadows are usually stronger than premium mockups
- Icon size mismatch because mockups often use 18-20px while defaults are 16px or 24px
- Text wrapping differs because container width or font metrics do not match
- Vertical rhythm drifts because one 8px miss compounds through the page
- Cards look similar but not aligned because min-height, gap, or grid settings differ
- Mobile becomes stacked leftovers instead of preserving content priority
- Decorative backgrounds overpower the content because opacity/blur values were guessed
- Existing behavior breaks because visual work touched hooks, auth, forms, or routing unnecessarily

## Fidelity Standards

Aim for a build that feels like the same product, not a cousin of it.

Check these details:

- Section order matches the reference unless intentionally improved
- Primary action is visually dominant and correctly placed
- Spacing has the same rhythm and breathing room
- Headings carry the same weight and emotional hierarchy
- Cards align cleanly and share consistent heights where appropriate
- Backgrounds, textures, gradients, and decorative elements support the content
- Motion feels premium, restrained, and purposeful
- Mobile layout keeps the same priority order, not just stacked leftovers
- Accessibility basics are preserved: contrast, focus states, readable type, semantic structure

## Output Format

When responding to the user before coding, use:

```markdown
## Build Plan

**Reference intent:** ...
**Fidelity strategy:** exact match / brand-consistent interpretation / intentional improvement
**Reuse:** ...
**Create / modify:** ...
**Do not touch:** ...

**Design tokens:**
- Colors: ...
- Typography: ...
- Spacing: ...
- Geometry: ...
- Effects: ...

**Component map:** ...
**Asset inventory:** ...
**Responsive plan:** ...
**Risks / assumptions:** ...
```

When reporting after coding, use:

```markdown
## Completed

**Matched:** ...
**Improved intentionally:** ...
**Files changed:** ...
**Verification:**
- Mobile 375px: ...
- Tablet 768px: ...
- Desktop 1440px: ...
**Known deviations:** ...
**Still worth reviewing:** ...
```

## Client Work Guidance

For Trust Tai work, preserve the premium, warm, system-led brand direction and avoid generic dashboard sameness.

For client work, infer the client's visual standard from supplied references and existing screens. Respect their brand first, then improve clarity, usability, and consistency. If multiple references conflict, choose the one that best matches the stated goal and explain the choice.
