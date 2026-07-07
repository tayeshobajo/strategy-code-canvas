// Sanitize server-fn error propagation. Logs the underlying (potentially
// schema-revealing) Supabase / PostgREST error server-side, then throws a
// generic message safe to send to authenticated clients.
//
// Use for `if (error) throwGeneric(error, "message")` in place of
// `throw new Error(error.message ?? "message")` so that table/column/
// constraint names never leak to the browser.
export function throwGeneric(error: unknown, publicMessage: string): never {
  try {
    console.error(`[engine] ${publicMessage}`, error);
  } catch {
    // logging must never mask the original failure
  }
  throw new Error(publicMessage);
}
