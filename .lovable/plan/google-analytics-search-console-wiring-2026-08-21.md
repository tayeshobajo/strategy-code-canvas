# Google Analytics + Search Console wiring

## What's true today

- Search Console is connected and working. The linked connection returns your property list, and `https://trusttai.com/` shows as siteOwner. The domain property `sc-domain:trusttai.com` does **not** exist in the account yet.
- Google Analytics is not connected in any form. Property `515344531` is not wired to this project.

## Before anything else: rotate the key

The service account JSON you pasted includes its private key, so that key is compromised. Delete it in Google Cloud IAM for `trust-tai-os@trust-tai-security-scanning.iam.gserviceaccount.com` and create a fresh key. I will not use the pasted one.

## 1. GA4 tracking on the public site

- Connect the Google Analytics connector so the measurement ID is supplied by Lovable rather than hardcoded.
- Add a small analytics module that loads gtag once at startup and configures the property.
- Send a page view on every client-side route change, alongside the existing internal page tracking (the two stay independent; nothing existing is removed).
- Guard it so it stays inert during server rendering and when no measurement ID is present.

## 2. In-app GA4 reporting

- Store the **new** service account key as a project secret.
- Add a server function that mints a Google access token from that key and calls the GA4 Data API for property `515344531`.
- Return a compact snapshot: sessions, active users, top pages and top channels for the last 28 days.
- Cache the result server-side so page loads read the snapshot instead of calling Google on every request.
- Surface it on an internal-only page. Not exposed on the public marketing site.

## 3. Verify `sc-domain:trusttai.com`

- Request a DNS TXT verification token for the domain property.
- Give you the exact record to add at your DNS host.
- Once it has propagated, call verification, add the property to Search Console, and submit the sitemap against it.
- The existing `https://trusttai.com/` property stays; the domain property is additive and also covers subdomains.

Step 3 pauses on you: I cannot add the DNS record. I will hand you the record value and resume when you say it is live.

## Technical notes

- gtag reads the measurement ID from the connector's public env var via `import.meta.env`; initialization lives in a client-only module imported from the root route.
- The GA Data API call runs in a `createServerFn` handler. The Workers runtime has no Node crypto signing helper for Google's libraries, so the JWT is signed with Web Crypto `RSASSA-PKCS1-v1_5` and exchanged at the Google token endpoint. Service account credentials are read inside the handler, never at module scope, and never reach the browser.
- Search Console verification and property add go through the existing connector gateway; no new credentials are needed for step 3.

## Out of scope

- No change to the existing intake, event outbox, or Core delivery path.
- No public-facing analytics dashboard.
