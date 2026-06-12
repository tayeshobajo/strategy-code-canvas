## Problem

In `src/routes/index.tsx`, the hero `<img>` uses `object-cover object-left`. The source photo is wide and the booklet is on the right side, so anchoring the crop to the left pushes the booklet out of view. The left-edge mask gradient then fades what little desk remains, making the image look broken/empty.

## Fix

Single-file change in `src/routes/index.tsx`, hero `<img>` only. No other sections, copy, or layout touched.

- Change `object-left` → `object-right` so the crop anchors on the booklet.
- Keep `object-cover`, the max-height cap, and the left-edge feather mask as-is.
- On mobile (where the column is wide and short), `object-right` still keeps the booklet in frame; if it ever feels too tight we can swap to `object-[75%_center]`, but start with the simpler value.

### Technical detail

```tsx
// before
className="h-full max-h-[460px] w-full rounded-sm object-cover object-left lg:max-h-none"

// after
className="h-full max-h-[460px] w-full rounded-sm object-cover object-right lg:max-h-none"
```

No changes to the mask gradient, grid, header, buttons, or any section below the hero.

## Verification

Open the preview at desktop (1477px) and mobile (~390px) and confirm the booklet cover ("BUSINESS OPERATING ROADMAP") is visible in both, with the left edge feathering smoothly into the text column.
