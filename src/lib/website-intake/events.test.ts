import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { signBody } from "./core-client.server";
import { toCoreEventsBody, WEBSITE_EVENT_NAMES } from "./core-contract";
import { normalizeEvent, sanitizeProperties, isWebsiteEventName } from "./event-sanitize";
import { isContentRead } from "./use-content-read";
import { parseAttribution } from "./attribution";

const base = {
  event_key: "sess_1:page_view:/",
  event_name: "page_view",
  occurred_at: "2026-08-22T00:00:00.000Z",
  session_id: "sess_1",
  path: "/",
};

describe("event vocabulary", () => {
  it("accepts only the agreed names", () => {
    for (const n of WEBSITE_EVENT_NAMES) expect(isWebsiteEventName(n)).toBe(true);
    expect(isWebsiteEventName("mouse_move")).toBe(false);
    expect(normalizeEvent({ ...base, event_name: "scroll_depth" } as never)).toBeNull();
  });
});

describe("core contract shape", () => {
  it("sends flat utm under a website source", () => {
    const event = normalizeEvent({
      ...base,
      utm: { source: "linkedin", medium: "social", campaign: null, term: null, content: null },
    } as never)!;
    expect(event.utm_source).toBe("linkedin");
    expect(event).not.toHaveProperty("utm");
    const body = toCoreEventsBody([event]);
    expect(body.source_app).toBe("website");
    expect(body.source_channel).toBe("website");
  });
});

describe("sensitive payloads", () => {
  it("strips content, contact detail and credentials", () => {
    const props = sanitizeProperties({
      question_id: "future_day",
      modality: "voice",
      answer_text: "We want to double revenue",
      email: "founder@example.com",
      password: "hunter2",
      api_key: "sk_live_x",
      question_text: "What does a good day look like?",
      note: "long freeform",
      cta: "build_your_roadmap",
      prose: "x".repeat(400),
    });
    expect(props).toEqual({ question_id: "future_day", modality: "voice", cta: "build_your_roadmap" });
  });

  it("drops sensitive keys before an event reaches Core", () => {
    const event = normalizeEvent({
      ...base,
      event_name: "intake_answered",
      properties: { question_id: "q1", modality: "text", answer: "secret content" },
    } as never)!;
    expect(event.properties).toEqual({ question_id: "q1", modality: "text" });
  });
});

describe("server-only signing", () => {
  it("signs timestamp.body with HMAC-SHA256", () => {
    const raw = JSON.stringify(toCoreEventsBody([normalizeEvent(base as never)!]));
    const expected = createHmac("sha256", "shh").update(`123.${raw}`).digest("hex");
    expect(signBody("shh", "123", raw)).toBe(expected);
  });

  it("keeps the secret out of anything the browser can import", async () => {
    const track = await import("./track");
    expect(Object.keys(track)).toEqual(expect.arrayContaining(["trackEvent", "trackCta"]));
    expect(JSON.stringify(Object.keys(track))).not.toContain("sign");
  });
});

describe("session and attribution persistence", () => {
  it("keeps one session id and first-touch utm through the journey", () => {
    const a = parseAttribution({
      url: "https://trusttai.com/?utm_source=linkedin&utm_medium=social",
      referrer: "https://www.linkedin.com/",
      sessionId: "sess_1",
      startedAt: "2026-08-22T00:00:00.000Z",
      pageViews: 0,
    });
    expect(a.session_id).toBe("sess_1");
    expect(a.utm_source).toBe("linkedin");
    expect(a.entry_referrer).toBe("https://www.linkedin.com/");
  });
});

describe("page_view dedupe", () => {
  it("derives one stable key per route entry", () => {
    const key = (path: string, loc: string) => `sess_1:page_view:${path}:${loc}`;
    expect(key("/", "k1")).toBe(key("/", "k1"));
    expect(key("/", "k1")).not.toBe(key("/about", "k2"));
  });
});

describe("content_read threshold", () => {
  it("fires only past 50% progress and 30 active seconds", () => {
    expect(isContentRead(0.2, 60)).toBe(false);
    expect(isContentRead(0.9, 5)).toBe(false);
    expect(isContentRead(0.5, 30)).toBe(true);
  });
});
