## Scope

All changes live in `src/routes/build-my-roadmap.tsx`. No backend, schema, or server‑function changes. Intake content, autosave, reflection, validation, and submit flow stay exactly as they are — they just render inside a full‑screen overlay instead of a page section.

## 1. Cal.com popup for the call door

- Add a tiny `useCalEmbed()` hook that lazily injects Cal.com's official embed script (`https://app.cal.com/embed/embed.js`) the first time it's needed, then exposes `window.Cal`.
- Replace the call door's `<a href="#availability">` with a `<button>` that calls `Cal("modal", { calLink: "tai-shobajo-uzxa1b" })`. Native Cal.com popup over the page. No navigation, no route change. Card and copy unchanged.
- Graceful fallback: if the script fails to load (offline, blocker), open `https://cal.com/tai-shobajo-uzxa1b` in a new tab so the door never dead‑ends.

## 2. Note door opens a full‑screen overlay

- Remove the inline `<IntakeExperience />` rendered as a page section. The component stays — only its mount point changes.
- New `<IntakeOverlay open onClose>` wrapper: `position: fixed; inset: 0; z-index: 80;` on a `bg-paper` surface that fully covers the page. The overlay portals to `document.body` so it escapes any parent stacking context.
- Header inside the overlay: small Trust Tai wordmark left, an "Exit and return home" control on the right that triggers `onClose`. (No other site chrome — the marketing page sits beneath, unmounted from view but still in the DOM.)
- The existing "Exit and return home" affordance inside the intake stays and routes through `onClose` so behavior is consistent whether the user exits from the top or the bottom.
- Body lock: while `open`, set `document.body.style.overflow = "hidden"` and restore on close. Trap focus to the overlay; first focusable element receives focus on open; restore focus to the door button on close.
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the overlay's hidden heading. `Esc` closes.

### Open transition (≈320ms, premium)

- Backdrop fades from 0 to 1 over 320ms `cubic-bezier(0.32, 0.72, 0, 1)`.
- Inner content (the intake column) translates from `translateY(8px)` + `opacity 0` to settled over 380ms with a 60ms delay so the room "settles in" rather than snapping.
- Close runs in reverse over ~240ms.
- `@media (prefers-reduced-motion: reduce)`: instant open/close, no transform, no fade.

## 3. URL state — overlay lives in the URL

Single source of truth: the URL query string. The component reads/writes it; nothing else.

- **Open** → push `?write=open` (preserving any existing `?draft=<token>`).
- **Draft created** → replace URL with `?write=open&draft=<token>` (the resume link).
- **Close** (button, Esc, or backdrop) → replace URL back to `/build-my-roadmap` with `draft` preserved only when there is unsaved work the user might want to resume; otherwise stripped. Configurable, but default: keep `?draft=<token>` on close so the resume link in the email continues to work, drop `?write=open`.
- **Browser back** → listen on `popstate`. If overlay is open and URL no longer contains `?write=open`, close the overlay (no navigation away from the page). This makes back behave like "close the modal" rather than "leave the site".
- **Resume link** (`?write=open&draft=<token>`) → on mount, if `write=open` is present, open the overlay; existing draft hydration logic runs unchanged and lands the user on the saved step.
- Use `window.history.pushState` to open and `replaceState` for in‑overlay URL updates (so we don't pollute history with autosave token writes).

URL helper lives in the page component, not the IntakeExperience, so the existing intake code only needs to call `onClose()` instead of routing.

## 4. Mobile

The overlay is already `inset: 0`, so mobile is full‑screen by construction. Same open transition (respecting reduced motion), same URL contract, same Esc/back behavior. The top "Exit and return home" control sits in a sticky header inside the overlay so it stays reachable while the user scrolls long answers.

## 5. Cut the reassurance band

- Delete the `<ConversationLead />` invocation from the page (the "One 30‑minute conversation. No slides, no pitch, no obligation." band between Hero and TwoDoors).
- Replace with a vertical spacer (`pt-10 lg:pt-14` on TwoDoors, plus a little extra bottom padding on Hero) so the page breathes rather than reassuring a third time. Hero and the conversation card still carry the line.
- Leave the `ConversationLead` component definition in place but unused — easy to restore if you change your mind. (If you'd rather I delete it outright, say so.)

## Guardrails

- Sentence case, no em‑dashes, no exclamation points anywhere new.
- No DB writes from the browser, no model keys in client code — overlay is pure UI, all data calls still go through the existing server functions.
- Keep every earlier intake fix: no AI label, no "we never send your words to a bot" line, trimmed reassurance, optional skips, reflection lock, editorial cross‑fade.

## Files touched

- `src/routes/build-my-roadmap.tsx` only.

## Acceptance checks

- Clicking "Book a 30‑minute call" opens the Cal.com modal in place; closing it returns to the unchanged page. Hard reload of the page mid‑modal does not leave a broken state.
- Clicking "Leave a Roadmap note" opens the full‑screen overlay with the URL becoming `?write=open`. The marketing page is not navigated.
- Closing via button or Esc restores the URL and returns focus to the door button.
- Browser back, with the overlay open, closes the overlay and stays on `/build-my-roadmap`.
- Visiting `/build-my-roadmap?write=open&draft=<valid-token>` directly opens the overlay onto the hydrated draft.
- The "One 30‑minute conversation" band is gone; the hero‑to‑doors transition reads as breathing room, not silence.
- `prefers-reduced-motion: reduce` skips fades/translates on both the overlay and any inner Cal.com handoff.
