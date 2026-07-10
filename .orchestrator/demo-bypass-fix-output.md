# Demo Bypass Security Fix — Summary

**Date:** 2026-07-10  
**Issue:** `?__visual=demo` on `/portal/roadmap` permanently bypassed portal authentication in production, creating a standing unauthenticated surface.

---

## Changes Made

### 1. `src/routes/portal.tsx` (line 41)

**Before:**
```ts
if (
  location.pathname === "/portal/roadmap" &&
  /(?:^|[?&])__visual=demo(?:&|$)/.test(location.searchStr ?? "")
) {
  return { user: null };
}
```

**After:**
```ts
if (
  import.meta.env.DEV &&
  location.pathname === "/portal/roadmap" &&
  /(?:^|[?&])__visual=demo(?:&|$)/.test(location.searchStr ?? "")
) {
  return { user: null };
}
```

The `beforeLoad` auth guard now only skips authentication for the `?__visual=demo` path when running in development mode. In production (`import.meta.env.DEV === false`), the condition short-circuits immediately and the request falls through to the standard Supabase auth check, which redirects unauthenticated users to `/portal/login`.

---

### 2. `src/routes/portal.roadmap.tsx` (line 115)

**Before:**
```ts
if (search.__visual === "demo") {
  return (
    <RoadmapCanvasProvider>
      <DemoRoadmapView />
    </RoadmapCanvasProvider>
  );
}
```

**After:**
```ts
if (import.meta.env.DEV && search.__visual === "demo") {
  return (
    <RoadmapCanvasProvider>
      <DemoRoadmapView />
    </RoadmapCanvasProvider>
  );
}
```

The component-level check that renders `DemoRoadmapView` (a zero-server-call, zero-auth fixture renderer) is now also gated to DEV only. In production, this branch is never taken — even if somehow a request reached the component, it would fall through to `RoadmapView` which requires an authenticated Supabase session.

---

## Defense in Depth

Both layers are now gated:

| Layer | File | Guard |
|---|---|---|
| Router `beforeLoad` (auth gate) | `portal.tsx` | `import.meta.env.DEV &&` |
| Component render (fixture renderer) | `portal.roadmap.tsx` | `import.meta.env.DEV &&` |

Vite statically replaces `import.meta.env.DEV` at build time — in production builds it becomes `false`, and the dead branch is tree-shaken entirely. The `DemoRoadmapView` component and its fixture imports (`DEMO_ROADMAP_RAW`, `DEMO_PROJECT`) may also be eliminated by the bundler.

---

## Test Results

```
✓ src/lib/__tests__/portal-context-leaks.test.ts (8 tests) 3ms
Test Files  1 passed (1)
Tests       8 passed (8)
```

All 8 portal context leak tests pass. No regressions.

---

## Files Modified

- `src/routes/portal.tsx` — 1 line added (`import.meta.env.DEV &&`)
- `src/routes/portal.roadmap.tsx` — 1 line changed (added `import.meta.env.DEV &&` to condition)

No other files were touched.
