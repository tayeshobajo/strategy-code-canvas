# Animate the hero conversation

Make the three chat bubbles in the Build My Roadmap hero play out like a live text conversation instead of appearing all at once.

## Behaviour

1. Hero loads with the chat area empty (reserved height, so nothing jumps).
2. A typing indicator (the three dots) appears on the left, pauses ~1s, then the first question bubble replaces it and fades/slides in.
3. Short pause, then the founder's blue reply slides in from the right.
4. Typing indicator again, then the second question appears.
5. The typing indicator stays at the end, as it does today — the conversation reads as still going.
6. The sequence runs once on load; it restarts only if the section scrolls back into view after being fully out of view (optional, kept subtle).

Timing feels human, not mechanical: roughly 900ms of "typing" before each incoming line, ~600ms before the founder's reply, longer pause before the longer question.

## Accessibility and performance

- Respect `prefers-reduced-motion` using the existing `useReducedMotion` hook: when reduced, all three bubbles and the dots render immediately with no motion.
- No layout shift: the chat column keeps a fixed minimum height matching the finished state.
- Timers cleaned up on unmount.

## Technical notes

- Change is contained to `src/components/intake/IntakeLanding.tsx` (hero chat block plus the local `Bubble`/`Dot` components).
- Small local state machine (step index) driven by a `setTimeout` chain in `useEffect`; typing indicator shown between steps.
- Animation via existing Tailwind utilities (`animate-fade-in` / opacity + translate transitions), no new dependency.
- No copy changes, no changes to the intake conversation itself or any backend logic.
