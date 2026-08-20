# Narrow the Roadmap invitation to match the reference

The current panel stretches too wide and reads as a landscape banner. The reference is a portrait card: narrower, taller, with the content stacked in a calm vertical rhythm.

## What changes

**Width and proportion**
- Reduce max width from 860px to about 600px on desktop (roughly 560 to 620px), so the card reads portrait rather than landscape.
- Keep it anchored bottom right with breathing room, and keep the panel scrollable if it exceeds viewport height.
- Mobile stays full width minus a small gutter.

**Header**
- Logo left, with BUILD MY ROADMAP as a quiet mono uppercase line sitting directly beneath the wordmark rather than beside it.
- Close icon becomes a small bordered rounded square button, top right.

**Headline**
- Two lines: first line in ink, second line ("what comes next.") in royal blue italic serif, matching the reference.

**Body**
- Slightly larger line height, deep ink at high contrast, contained to a comfortable measure.

**Trust signals**
- Return to three bordered cards in a compact row, matching the reference: a small royal outline icon in a soft royal-tinted rounded square, title beside it, a thin inner rule, then the supporting line below.
- Light borders, low height, no shadow. On mobile they stack.

**CTA**
- Full-width dark navy button inside the card padding with a small arrow.
- Time note below, centered, in mono uppercase with a small clock icon.

**Footer**
- Kept behind a full-bleed top rule with the small people icon, left aligned next to the text as in the reference.

**Collapsed pill**
- Unchanged in style. While the panel is open the pill is hidden, as today.

## Technical notes

Single file change: `src/components/RoadmapInvite.tsx`. Copy strings in `INVITE_COPY` stay as approved; only layout, sizing, and typography change. Route exclusion logic in `src/lib/roadmap-invite-visibility.ts`, session behavior, attribution, and the existing tests are untouched. Verification: existing invite tests, typecheck, build, plus desktop and mobile screenshots.
