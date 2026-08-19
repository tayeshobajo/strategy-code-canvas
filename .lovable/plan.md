# Polish the Build My Roadmap conversation room

Two changes: give the modal real vertical presence, and put your face on the conversation.

## 1. Height and breathing room

Today the panel sizes to its content (`sm:h-auto`, `max-h: 88vh`), so early in the conversation — when there is only one question on screen — the modal collapses to a short band with a lot of empty page around it.

- Give the panel a fixed working height on desktop: roughly 86vh tall with a sensible floor (about 640px) and the existing 92vh ceiling, so it holds its shape from the first question to the last.
- Keep full-screen behaviour on mobile as-is.
- Increase the transcript's vertical padding and the space between exchanges so messages breathe rather than stack tight.
- Since the panel is now taller than the content early on, anchor the conversation to the bottom of the scroll area (like a real chat) so the first question sits just above the composer instead of floating at the top of a mostly empty panel.
- Slightly loosen composer padding to match.

## 2. Your headshot as the avatar

- Upload `tai-signature-headshot.png` to the CDN as a project asset (no binary in the repo).
- Show it as a small circular avatar next to every Tai message in the transcript, and next to the "Thinking…" indicator, so the conversation reads as coming from a person.
- Repeated consecutive Tai messages show the avatar once at the top of the group; founder messages stay right-aligned with no avatar.
- Add it to the top bar next to the Trust Tai logo as a small presence cue ("You're talking with Tai").
- Alt text names you; the avatar is decorative-adjacent but labelled for screen readers.

## Technical notes

- Files: `src/components/intake/ConversationRoom.tsx` (panel sizing, `TaiBlock`, `Thinking`, `TopBar`, scroller padding), plus a new `src/assets/tai-headshot.png.asset.json` pointer created with `lovable-assets create`.
- No changes to conversation logic, adaptive question selection, reflection, or the Website → Scout contract.
- Existing tests and typecheck run afterwards.
