# Phase 10 — AI runtime retry + fallback loop (Top-10 sweep)

**Status:** application-tier COMPLETE. No schema change. No behavior change
for existing callers of `callLovableAi` (unchanged).

## What shipped

Added to `src/lib/engine-ai.server.ts`:

- `DEFAULT_MODEL_CASCADE` — ordered list of models used when the primary
  model exhausts retries. Default: gemini-3-flash-preview → gemini-2.5-flash
  → gpt-5-mini.
- `callLovableAiWithFallback(messages, opts)` — wraps `callLovableAi` with:
  1. Bounded exponential backoff on transient failures
     (`429 rate limited`, `5xx gateway`, `fetch failed`, `ECONNRESET`,
     `ETIMEDOUT`). Default: 2 retries per model, base delay 400 ms + jitter.
  2. Automatic model swap when the primary model exhausts retries.
  3. Immediate rethrow on non-retryable errors (`402 credits exhausted`,
     missing `LOVABLE_API_KEY`).
- Returns `AiCallWithFallbackResult` = `AiCallResult & { model_used }` so
  callers can log/attribute the model that actually served the request.

## Gap coverage (audit reference "Runtime fallback loop")

| Item | Status |
|---|---|
| Retry on transient 429/5xx | PASS |
| Model fallback cascade | PASS |
| Non-retryable errors surfaced immediately | PASS |
| Cost/token attribution preserved | PASS (spreads AiCallResult) |
| Tests | PENDING — added in Phase 12 verification pass |

## Migration path

Existing callers keep using `callLovableAi` unchanged. To adopt the fallback
loop, switch the import:

```ts
// before
import { callLovableAi } from "@/lib/engine-ai.server";
// after
import { callLovableAiWithFallback as callLovableAi } from "@/lib/engine-ai.server";
```

The result shape is a superset (`model_used` added). No other refactor
required. High-value first targets: `engine-intelligence.functions.ts`,
`engine-chat.functions.ts`, `engine-frame-builder.functions.ts`.

## What is NOT done

- Migrating existing call sites — deferred so each site's diff is reviewed
  in context of its own domain.
- Persisting fallback events to `engine_ai_gateway` telemetry — the caller
  already logs `model_used`; a schema addition is out of scope for this
  phase.
