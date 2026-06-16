## Goal
Strengthen structured data on `/about`, ensure the Organization logo is a fully qualified URL matching the real header/footer asset, add BreadcrumbList, and produce a short validation report covering schema.org + OpenGraph + canonical.

## Changes to `src/routes/about.tsx`

1. **Origin helper for absolute URLs**
   - Add a small `createServerFn` (`getRequestOrigin`) in `src/lib/origin.functions.ts` that reads `x-forwarded-proto` + `host` and returns the absolute origin.
   - Call it from the route `loader` and expose `origin` via `loaderData` so `head()` can build absolute URLs for `logo`, `image`, `og:image`, `og:url`, `canonical`, and `@id` fields.

2. **Logo asset alignment**
   - Header/footer use `src/assets/trust-tai-logo.png` (light) and `trust-tai-logo-white.png` (dark). Import the light logo asset JSON and use its `.url` for Organization `logo`, prefixed with the absolute origin so it is fully qualified (Google requires absolute logo URLs).

3. **Expanded JSON-LD blocks** (all in `head().scripts`)
   - **Organization** (`@id: ${origin}/#organization`)
     - `name`, `url` (absolute), `logo` as `ImageObject` with absolute `url`, `width`, `height`
     - `sameAs` (leave empty array or omit if none)
     - `founder` → reference Person by `@id`
   - **WebSite** (`@id: ${origin}/#website`)
     - `name`, `url` (absolute), `publisher` → reference Organization by `@id`, `inLanguage: "en"`
   - **Person** (`@id: ${origin}/#tai`)
     - `name: "Tai"`, `jobTitle: "Founder & Conductor"`, absolute `image` (portrait), `worksFor` → Organization `@id`, `url` → `${origin}/about`
   - **AboutPage** (`@id: ${origin}/about#aboutpage`)
     - `url`, `name`, `description`, `primaryImageOfPage` (absolute), `isPartOf` → WebSite `@id`, `about` → Person `@id`, `breadcrumb` → BreadcrumbList `@id`
   - **BreadcrumbList** (`@id: ${origin}/about#breadcrumb`)
     - Item 1: Home → `${origin}/`
     - Item 2: About → `${origin}/about`

4. **Meta tags**
   - Ensure `og:url`, `og:image`, `twitter:image`, and `<link rel="canonical">` use the absolute origin (not relative) so crawlers and the validator resolve them unambiguously.

## Validation report

Run a script (after build) that fetches the `/about` HTML from the running preview and checks:
- `<title>`, `<meta name="description">` present and non-default
- `og:title`, `og:description`, `og:url`, `og:image`, `og:type`, `og:site_name`
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- `<link rel="canonical">` present, absolute, self-referencing `/about`
- All `application/ld+json` blocks parse as JSON
- Each schema has required fields: Organization (`name`, `url`, `logo`), WebSite (`name`, `url`), Person (`name`), AboutPage (`name`, `url`), BreadcrumbList (`itemListElement` with positions)
- Organization `logo` is absolute (`https://…`) and returns 200

Output a concise pass/fail markdown report in chat (no file written).

## Out of scope
- No changes to other routes' JSON-LD.
- No changes to copy, layout, or images.
- No new sitewide JSON-LD in `__root.tsx` (keeps leaf-only canonical/OG pattern intact).
