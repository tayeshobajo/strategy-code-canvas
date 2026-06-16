# Insights page — match reference design

Four focused fixes in `src/routes/insights.tsx`. No business logic, no data, no virtualization changes.

## 1. Hero SVG — sweeping dotted path + paper airplane

Reference shows one long, gently undulating dotted line that crosses the whole hero band from lower-left, dips under the headline, then rises to the upper-right where a small paper airplane sits at the tip with a curling tail. The current `HeroPath` is close but the curve is too flat through the middle and the "airplane" is a tiny arrow-shape, not the recognizable triangle glyph.

Updates to `HeroPath`:
- Redraw the `<path d=...>` so it: starts below the left edge, rises over a hill near the eyebrow, dips beneath the subhead, then sweeps up off the right edge — same dashed style (`strokeDasharray="2 7"`) and same `url(#hero-path)` gradient.
- Add a second short, more tightly-dashed `<path>` for the airplane's *trail* — a small curl ending where the plane sits (upper-right).
- Replace the small arrow glyph with a proper paper-airplane: two triangles forming the body + fold, drawn with `stroke="oklch(0.48 0.18 262)"`, `fill="oklch(0.72 0.12 262 / 0.18)"`, rotated ~-15°. Keep the existing milestone open-circles along the path.

## 2. The Current Argument — milestone path SVG

Reference shows 4 stops on a rising dotted curve:
- `Clarity` (bottom-left, small filled dot, label below)
- `Sequence` (mid-left, filled dot, label below)
- `Leverage` (center, **active**: filled dot inside a concentric breathing ring, label below in royal)
- `Freedom` (top-right, filled dot, label to the right of the dot)

Updates to `MilestonePath`:
- Adjust stop coordinates so the curve is a smooth rise (Clarity low-left → Freedom high-right) matching the reference's gentler arc — current curve drops back down between Sequence and Leverage. New approximate stops: Clarity (40,230), Sequence (210,165), Leverage (360,140, active), Freedom (510,55).
- Keep the breathing ring on the active stop, but tighten it: outer ring r=13 at 35% opacity, inner ring r=8 at 55%, solid dot r=4. The active dot color stays royal.
- Move the `Freedom` label to the *right* of its dot (x+12, y+4, `textAnchor="start"`) — every other label stays centered below at `y+22`.
- Keep `role="img"` + descriptive `aria-label`.

## 3. Row dot vertical alignment

Currently the category column uses `sm:items-start sm:pt-[10px]`, which pushes the bullet up to the top of the row above the SMALL CAPS category text baseline. Reference shows the dot vertically centered with the category label.

Change in the row template:
- Category column: replace `sm:items-start sm:pt-[10px]` with `sm:items-center sm:pt-0`. Remove the redundant `items-center` on mobile (keep it implicit) — final classes: `col-span-2 flex items-center gap-3 sm:col-span-1`.
- Keep the meta column (`MIN READ / DATE`) at `sm:pt-[10px]` so it still aligns with the top of the title.
- Keep the arrow column at `sm:pt-[10px]`.

## 4. Full-row hover highlight

Currently only the title color changes on hover (`group-hover:text-royal` on `<h3>`). Reference and request: the whole row should highlight.

Change:
- Move `group` from the `<li>` onto the `<Link>` and add a subtle full-row background: `hover:bg-royal/[0.025]` and `transition-colors duration-200` on the `<Link>`. Add `-mx-4 px-4 rounded-sm` so the highlight reads as a soft strip that extends slightly past the rule lines without breaking the column grid.
- Keep `group-hover:text-royal` on the title and `group-hover:translate-x-1` on the arrow — they continue to work because `group` is now on the link.
- Ensure `divide-y` borders still render (they're on the `<ul>`, unaffected).

## Out of scope

- No changes to data, sort/filter/search logic, infinite scroll, virtualization, or tests.
- No layout changes to the featured section's text column or the article list grid columns.

## Files touched

- `src/routes/insights.tsx` — `HeroPath`, `MilestonePath`, and the row template inside `ArticleList`.
