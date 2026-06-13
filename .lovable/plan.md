# Animate the three walks

Add a one-time, scroll-triggered walk animation to each of the three routes in the "What the journey costs" section of `src/routes/index.tsx`. No copy, layout, axis, or pricing changes.

## Scope

Only the walks chart block (currently lines ~526–594 in `src/routes/index.tsx`). Everything else stays.

## Approach

Replace the static dotted-line + start/end dots inside the `WALKS.map(...)` row with a small self-contained `<WalkRoute />` component built right in the same file. The component owns:

- the dotted "unwalked" trail (low-opacity electric blue, full width to its Point B)
- a solid electric blue overlay trail that grows from 0% → 100% of the route during the walk
- a hollow Point B marker that fills + soft pulse-and-settle on arrival
- the walking figure SVG positioned along the route via `left: progress%`
- a subtle two-frame bob (translateY alternating ~1px) while moving
- start (Point A) dot, unchanged

### Same on-screen pixel speed

Each route's container is measured (ref + `ResizeObserver`) to get its pixel width. The parent `WalksChart` picks the longest route's pixel width and a duration `D` (e.g. 3.2s for Steady). Each route's animation duration = `D * (routeWidthPx / steadyWidthPx)`, which equals `D * months / 24`. All three start at the same instant, so pixel speed matches and arrival order is Fast → Middle → Steady.

### Trigger

A single `IntersectionObserver` on the chart container fires once (threshold ~0.35). Sets a `started` state which all three `<WalkRoute />` instances consume.

### Reduced motion

`window.matchMedia('(prefers-reduced-motion: reduce)')` — if reduce, skip animation and render the final state: figure at Point B, solid trail at 100%, marker filled.

### Figure

Inline the provided 24×40 SVG as a small `<WalkFigure />` component, fill `#0A0F1F`. Positioned absolute, `bottom` aligned just above the route line, `translateX(-50%)` centered on the progress point. No shadow puddle. The bob is a CSS keyframe (`@keyframes walk-bob`) only applied while `started && !arrived`, paused via `animation-play-state`.

### Trail fill

Two stacked absolutely-positioned bars at the route line's vertical center:
1. dotted: existing `border-dashed border-royal/70` at full route width, opacity ~0.35 when not yet walked-over (kept underneath)
2. solid: `bg-royal h-px` (1px solid line), `width: progress%`, transitions via `transition: width Xms linear` once `started`. Easing: linear for the walk; the last ~10% uses a CSS `cubic-bezier` ease-out by splitting into a tiny final tween (or simply accept linear and rely on the marker pulse for arrival emphasis — linear is fine per spec "steady near-linear").

Simpler implementation: drive `progress` with a single `requestAnimationFrame` loop per route from 0 → 1 over its duration with a mild ease-out applied only to the last 8%. Update `left` for the figure and `width` for the solid trail in the same frame. This avoids CSS transition timing drift across three concurrent animations.

### Marker arrival

When `progress === 1`: swap the hollow marker (border-only) for solid `bg-royal`, and add a one-shot `animate-marker-pulse` class (scale 1 → 1.35 → 1 over ~450ms, ease-out). Figure's bob animation stops; figure stays at marker.

## Files

- `src/routes/index.tsx` — replace the route render inside `WALKS.map` with `<WalkRoute progress={p} arrived={a} />`; add `WalksChart` wrapper that owns the IntersectionObserver, RAF loop, and reduced-motion check; add `WalkFigure` SVG component; add small `@keyframes walk-bob` and `@keyframes marker-pulse` either inline `<style>` once at top of section or via a `style` tag in the component.

No other files change. No new deps.
