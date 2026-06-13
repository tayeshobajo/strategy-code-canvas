Replace the footer logo with a white version that reads cleanly on the dark navy background.

Steps:
1. Generate a white variant of the existing Trust Tai logo (white wordmark + white "CONSULTANCY + AI AGENCY" tagline, paper-arrow icon kept light/white) on a transparent background, using the uploaded Logo as the source via imagegen edit. Save to `src/assets/trust-tai-logo-white.png`.
2. Upload it via `lovable-assets` and write `src/assets/trust-tai-logo-white.png.asset.json`. Remove the local PNG after upload.
3. Update `src/components/TrustTaiLogo.tsx` to import the new white asset JSON and use its URL (alt text unchanged). This component is used in the footer, so the swap fixes the unreadable dark-on-dark logo shown in the screenshot.

No other files change. Header logo (if it uses the same component) will also become white — confirm acceptable, or I can introduce a `variant` prop instead.