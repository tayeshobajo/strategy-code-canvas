/**
 * RT-6 — LLM judges for execution drift.
 * Kept intentionally small; each judge returns a plain JSON verdict.
 */
import { callLovableAi } from "@/lib/engine-ai.server";

export type JudgeVerdict = {
  drift: boolean;
  severity: "low" | "medium" | "high";
  classification:
    | "drift"
    | "out_of_scope"
    | "contradicts"
    | "missing_capability"
    | "unmapped";
  summary: string;
  suggested_action: string;
};

function safeJson<T = unknown>(s: string): T | null {
  try {
    const m = s.match(/\{[\s\S]*\}$/);
    return JSON.parse(m ? m[0] : s) as T;
  } catch {
    return null;
  }
}

const SYSTEM = `You are the RT-6 Execution Drift Judge. You compare one unit of execution work against an approved strategic anchor and decide whether the work drifts from the anchor.

Rules:
- Be conservative. Only flag drift when the work clearly does not serve the anchor.
- severity: "high" if the work contradicts the anchor or is entirely out of scope; "medium" if it is tangential; "low" if it merely lacks a clear mapping.
- classification must be one of: drift, out_of_scope, contradicts, missing_capability, unmapped.
- Reply with ONE JSON object matching: {"drift":bool,"severity":"low|medium|high","classification":"...","summary":"...","suggested_action":"..."}.
- No prose outside the JSON.`;

export async function judgeDrift(input: {
  anchorKind: "thesis" | "rationale" | "boundary" | "capability" | "delivery_scope";
  anchorText: string;
  workKind: string;
  workText: string;
}): Promise<JudgeVerdict | null> {
  const user = `ANCHOR (${input.anchorKind}):\n${input.anchorText.slice(0, 4000)}\n\nWORK (${input.workKind}):\n${input.workText.slice(0, 3000)}`;
  try {
    const res = await callLovableAi(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { json: true, temperature: 0.2 },
    );
    const parsed = safeJson<JudgeVerdict>(res.text);
    if (!parsed || typeof parsed.drift !== "boolean") return null;
    return parsed;
  } catch (e) {
    console.warn("[rt6.judge] failed", e);
    return null;
  }
}
