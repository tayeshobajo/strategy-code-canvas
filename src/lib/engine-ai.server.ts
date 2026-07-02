// Server-only Lovable AI Gateway helper. Do NOT import from client bundles.
// Uses direct fetch (no SDK dependency).

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

// Approximate per-1M-token costs for the default Gemini flash model, in cents.
// Used only to display an internal cost estimate for Tai; not billing.
const RATE_IN_CENTS_PER_M = 30; // $0.30 / M input tokens
const RATE_OUT_CENTS_PER_M = 250; // $2.50 / M output tokens

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiCallResult = {
  text: string;
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
};

export async function callLovableAi(
  messages: AiChatMessage[],
  opts: { model?: string; json?: boolean; temperature?: number } = {},
): Promise<AiCallResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
  };
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error(`AI rate limited. Retry shortly. ${errText}`);
    if (res.status === 402) throw new Error(`AI credits exhausted. Add credits in Settings → Plans & credits.`);
    throw new Error(`AI gateway ${res.status}: ${errText || res.statusText}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const tokens_in = data.usage?.prompt_tokens ?? 0;
  const tokens_out = data.usage?.completion_tokens ?? 0;
  const cost_cents = Math.max(
    1,
    Math.round(
      (tokens_in * RATE_IN_CENTS_PER_M) / 1_000_000 +
        (tokens_out * RATE_OUT_CENTS_PER_M) / 1_000_000,
    ),
  );
  return { text, tokens_in, tokens_out, cost_cents };
}

// Attempt to parse JSON output from the model. Strips ```json fences.
export function parseJsonOutput<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find first { ... } block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
