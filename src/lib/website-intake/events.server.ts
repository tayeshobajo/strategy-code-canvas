/**
 * Website → Core event pipeline.
 *
 * Events are analytics-grade signals only. They are queued in a local outbox
 * first, so a Core outage or a bad secret can never lose or block an intake.
 * Nothing here is allowed to throw into the conversation UX.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CORE_EVENTS_ENDPOINT,
  toCoreEventsBody,
  WEBSITE_EVENT_NAMES,
  type WebsiteEvent,
} from "./core-contract";
import { postSigned } from "./core-client.server";

const TABLE = "website_event_outbox";

export function isWebsiteEventName(name: string): boolean {
  return (WEBSITE_EVENT_NAMES as readonly string[]).includes(name);
}

async function markDelivered(keys: string[]) {
  if (!keys.length) return;
  await supabaseAdmin
    .from(TABLE)
    .update({ status: "delivered", delivered_at: new Date().toISOString(), last_error: null } as never)
    .in("event_key", keys);
}

async function markFailed(keys: string[], retryable: boolean, error: string) {
  if (!keys.length) return;
  await supabaseAdmin
    .from(TABLE)
    .update({ status: retryable ? "pending" : "failed", last_error: error.slice(0, 500) } as never)
    .in("event_key", keys);
}

/** Persist then attempt one batched send. Always resolves. */
export async function recordEvents(events: WebsiteEvent[]): Promise<{ queued: number; delivered: boolean }> {
  const valid = events.filter((e) => isWebsiteEventName(e.event_name)).slice(0, 50);
  if (!valid.length) return { queued: 0, delivered: false };

  try {
    await supabaseAdmin
      .from(TABLE)
      .upsert(
        valid.map((e) => ({ event_key: e.event_key, payload: e as unknown as never })),
        { onConflict: "event_key", ignoreDuplicates: true },
      );
  } catch (err) {
    console.error("website event queue failed", (err as Error).message);
  }

  const result = await postSigned({
    endpoint: process.env["CORE_EVENTS_ENDPOINT"] || CORE_EVENTS_ENDPOINT,
    body: toCoreEventsBody(valid),
  });
  const keys = valid.map((e) => e.event_key);
  try {
    if (result.ok) await markDelivered(keys);
    else await markFailed(keys, result.retryable, result.error);
  } catch (err) {
    console.error("website event bookkeeping failed", (err as Error).message);
  }
  return { queued: valid.length, delivered: result.ok };
}

/** Retry loop for anything Core has not accepted yet. */
export async function retryPendingEvents(limit = 100) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("event_key, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return { processed: 0, delivered: 0 };
  const rows = (data ?? []) as unknown as Array<{ event_key: string; payload: WebsiteEvent; attempts: number }>;
  if (!rows.length) return { processed: 0, delivered: 0 };

  const result = await postSigned({
    endpoint: process.env["CORE_EVENTS_ENDPOINT"] || CORE_EVENTS_ENDPOINT,
    body: toCoreEventsBody(rows.map((r) => r.payload)),
  });
  const keys = rows.map((r) => r.event_key);
  if (result.ok) await markDelivered(keys);
  else await markFailed(keys, result.retryable, result.error);
  return { processed: rows.length, delivered: result.ok ? rows.length : 0 };
}
