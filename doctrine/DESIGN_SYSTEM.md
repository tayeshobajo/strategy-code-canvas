# Trust Tai Roadmap Engine — Design System
*Authoritative design doctrine. Every build must follow this. No deviations without explicit approval.*

*Created: 2026-07-11. Source: Tai's design brief + mockup validation session.*

---

## Core Principle

Trust Tai should feel like a strategic operating institution — not a SaaS dashboard. Calm intelligence, visible direction, disciplined hierarchy. Someone responsible is watching the whole journey.

**The test:** Does this screen feel like a considered executive environment, or like another web app?

---

## Color Tokens

```css
/* Canvas */
--canvas: #F5F0E8;          /* Warm cream — page background */
--canvas-card: #FFFFFF;     /* Pure white — card surfaces on cream */

/* Navy — structure and authority */
--navy: #1B2A4A;            /* Primary nav, strong buttons, headings */
--navy-light: #2D4A7A;      /* Hover states, active indicators */
--navy-muted: #3D5A8A;      /* Secondary nav items */

/* Text */
--text-primary: #1B2A4A;    /* Same as navy — headings, body */
--text-secondary: #6B6560;  /* Warm grey — labels, supporting text */
--text-cream: #F5F0E8;      /* Text on navy backgrounds */

/* Borders */
--border: #E8E0D5;          /* Thin warm-grey — cards, dividers */
--border-strong: #C8BFB5;   /* Stronger border — active states */

/* Status — operational meaning only, never decorative */
--status-green: #22A05B;    /* Healthy, complete, passing */
--status-orange: #D97706;   /* Needs attention, warning */
--status-red: #DC2626;      /* Blocked, at risk, failed */
--status-purple: #7C3AED;   /* Awaiting approval, judgment needed */
--status-blue: #2563EB;     /* Active, in progress, directional */
```

---

## Typography

| Use | Font | Size | Weight | Color |
|-----|------|------|--------|-------|
| Page heading | Instrument Serif | 32px | Regular | --navy |
| Section heading | Instrument Serif | 24px | Regular | --navy |
| Sub-heading | Instrument Serif | 18px | Regular | --navy |
| Captain notes | Instrument Serif Italic | 14px | Regular Italic | --text-secondary |
| Body text | Inter | 14px | Regular | --text-primary |
| Supporting text | Inter | 13px | Regular | --text-secondary |
| Labels (caps) | Inter | 11px | Medium | --text-secondary |
| Button text | Inter | 14px | Medium | — |
| Table data | Inter | 13px | Regular | --text-primary |

**Labels:** Always uppercase, always letter-spacing 0.08em. Used for section titles, column headers, metadata keys.

**Captain notes:** Instrument Serif italic only. Never bold. Positioned in a cream card with thin border, or in the Captain sidebar panel.

---

## Components

### Buttons
```
Primary:   bg-navy text-cream px-6 py-2.5 rounded-md text-sm font-medium
           hover: bg-navy-light
           disabled: opacity-40 cursor-not-allowed

Secondary: border border-navy text-navy bg-transparent px-6 py-2.5 rounded-md
           hover: bg-navy/5

Danger:    border border-red text-red bg-transparent (for destructive actions only)
```
No gradients. No box shadows on buttons. No rounded-full pills for primary actions.

### Cards
```
Standard:  bg-white border border-border rounded-lg p-6
Inset:     bg-canvas border border-border rounded-lg p-4 (nested content)
Captain:   bg-white border border-border rounded-lg p-5 (italic serif content inside)
```
No floating shadows (box-shadow: none on cards). Borders carry the structure.

### Status Badges
```
Format:    text-xs font-medium px-2 py-0.5 rounded-full
Green:     bg-green/10 text-green border border-green/20
Orange:    bg-orange/10 text-orange border border-orange/20
Red:       bg-red/10 text-red border border-red/20
Purple:    bg-purple/10 text-purple border border-purple/20
Blue:      bg-blue/10 text-blue border border-blue/20
```

### Tables
```
Header row:  bg-canvas border-b border-border — Inter 11px uppercase text-secondary
Body rows:   bg-white border-b border-border — Inter 13px text-primary
             hover: bg-canvas/50
Expandable:  chevron right icon, rotates on expand
```
No zebra stripes. Border-bottom only between rows.

### Navigation Sidebar
```
Width:         240px fixed
Background:    --navy
Logo area:     24px top padding, cream/white
Nav items:     text-sm text-cream/70 hover:text-cream py-2 px-4
Active item:   text-cream bg-navy-light border-l-2 border-cream
Section label: text-xs uppercase tracking-wider text-cream/40 px-4 mt-6 mb-2
Captain panel: mt-auto — always at bottom, mountain motif, cream text
```

### Captain Panel (Sidebar)
```
Position:   Always bottom of left sidebar, mt-auto
Background: navy-light or slightly lighter than nav
Content:    Mountain/terrain illustration (muted, not dominant)
            Italic serif quote or status line
            Optional: key metrics (Total Projects: 47, Focus: Exceptions Only)
Height:     ~120-160px
```

---

## Layout

```
Left sidebar:    240px fixed, navy
Main content:    fluid, cream canvas, max-width 1200px, 32px horizontal padding
Right panel:     380px, slides in over main content (not pushing it)
Page padding:    32px horizontal, 24px vertical top
Section spacing: 32px between major sections
Content spacing: 16px between rows within a section
Card gap:        16px between cards in a row
```

### Settings Pages (two-panel)
```
Left panel:  240px — list/navigation within settings
Right panel: fluid — detail/edit area
Divider:     1px border-border
```

### Page Header Pattern
```
Serif heading (32px)
Warm-grey subheading (14px Inter) on the line below
Optional: breadcrumb above heading (12px Inter text-secondary)
Optional: status row (pills, owner, date) below subheading
Divider: none — whitespace carries the separation
```

---

## Motion

```
Transitions:   150ms ease — all interactive state changes
Expand/collapse: height + opacity, 150ms
Slide panels:  translateX, 200ms ease
No bounce, no spring, no dramatic reveals
No animations on data tables or status changes
```

---

## Mountain & Route Motifs

**Where they belong:**
- Captain sidebar panel — always
- Milestone completion moments — small mountain icon (16px)
- Point A → Point B visualization — route/terrain illustration
- Roadmap view — subtle contour lines as background texture (very low opacity)

**Where they do NOT belong:**
- Cards with data
- Tables
- Status badges
- Buttons
- Any functional/operational region

**Illustration style:** Muted navy tones on slightly lighter navy. Not illustrated — topographic/cartographic. Think survey maps, not travel posters.

---

## What to Avoid

- ❌ Dark backgrounds on any main content area
- ❌ Gradients anywhere
- ❌ Box shadows on cards (use borders)
- ❌ Floating action buttons
- ❌ Neon or saturated accent colors
- ❌ Marketing typography inside the app (no oversized hero text)
- ❌ Decorative icons (icons carry meaning only)
- ❌ Rounded-full corners on rectangular components
- ❌ Dense competing regions without clear hierarchy
- ❌ Modal dialogs for complex decisions (use side panels)
- ❌ Unnamed status scores ("Health: 73" — always explain the score)
- ❌ Activity feeds with system noise (saves, uploads, minor edits)

---

## Lovable Build Prompt Prefix

Include this at the start of every Lovable build prompt:

```
Follow doctrine/DESIGN_SYSTEM.md exactly for all visual decisions.
Warm cream canvas (#F5F0E8). Deep navy (#1B2A4A) sidebar and primary buttons.
Instrument Serif for all headings. Inter for all body text and UI.
No gradients, no box shadows on cards, no dark backgrounds.
Status colors for operational meaning only (green/orange/red/purple/blue).
Mountain motifs in Captain sidebar panel only.
Reference the approved mockup at mockups/strategy-code-canvas/[phase]/screen-1.png.
```

---

*This document is the source of truth for all visual decisions in the Roadmap Engine.*
*Any deviation requires explicit approval and a doctrine update.*
*Last updated: 2026-07-11*
