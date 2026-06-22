# About page: SEO metadata + clear next-step CTA

All edits in `src/routes/about.tsx`. Other files untouched.

## 1. Refresh SEO metadata (lines 71–75 area, used by meta tags 147–158)

Replace the existing strings so title, description, OG, and Twitter all reflect the refined About messaging (Roadmap standard, Conductor + team, care over noise).

| Field | New value |
|---|---|
| `title` | `About Trust Tai \| Roadmap standard, Conductor, and team` |
| `description` | `Trust Tai is led by Tai Shobajo and a team that turns the Roadmap into systems clients can use. Care over noise, discipline over shortcuts, transformation over price alone.` |
| `ogDescription` | `The Roadmap standard, the Conductor who protects it, and the team that builds the systems behind it. How Trust Tai works, and who it works best with.` |

These propagate to: `<title>`, `meta description`, `og:title`, `og:description`, `og:url` (unchanged), `twitter:title`, `twitter:description`, and the `AboutPage` JSON-LD `name` / `description`.

`og:image`, canonical, JSON-LD graph IDs, and the preload `<link>` stay as they are.

## 2. New "What to do next" CTA section

Add a `NextSteps` section component and mount it between `<HonestFit />` and `<SiteClosing ... />` in `AboutPage` (around line 240).

Layout: three side-by-side cards on desktop, stacked on mobile, on the `bg-paper` background to match `HonestFit`. Each card has an icon, short title, one-line body, and a text link to the destination route. Reuses existing icons already imported (MapIcon, Compass, Scale) and existing styles (rule borders, royal accent, font-display) — no new components, no new imports.

| Card | Title | Body | Link |
|---|---|---|---|
| Compass | Build your Roadmap | A 30-minute conversation. We listen first, then map the work. | `/build-my-roadmap` → "Start the Roadmap" |
| MapIcon | See what we build | The systems we ship behind the Roadmap, by sequence. | `/what-we-build` → "See the build" |
| Scale | Understand the investment | Pace, monthly investment, team capacity, and timing. | `/investment` → "See investment" |

Section header above the cards:
- Eyebrow: `What's Next`
- H2: `Three ways to take the next step.`
- Subhead: `Pick the entry point that fits where you are.`

The existing `SiteClosing` (with its single "Build My Roadmap" button) stays in place — `NextSteps` adds the explicit multi-option navigation the page is missing without removing the emotional close.

## Out of scope

- No changes to `SiteClosing`, footer, hero, or other About sections.
- No new asset imports or icon swaps beyond the already-imported set.
- Roadmap, Investment, What We Build routes themselves are untouched.
