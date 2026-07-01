// Pure, framework-free helpers for portal access-mismatch diagnosis.
// Kept separate so they're trivially unit-testable.

export type AccessRow = { revoked_at: string | null; stripe_session_id?: string | null };
export type PermissionRow = { revoked_at: string | null; project_id?: string | null };

export type AccessDiagnosisEventType =
  | "missing_workspace" // has access grant, but no client_portal_projects row
  | "unknown_email"; // signed in but no access row at all

export type AccessDiagnosis = {
  event_type: AccessDiagnosisEventType;
  has_client_access: boolean;
  has_permission: boolean;
  metadata: {
    client_access_rows: number;
    client_access_stripe_confirmed: boolean;
    permission_rows: number;
    permission_project_ids: string[];
  };
};

export function diagnoseAccessMismatch(input: {
  clientAccess: AccessRow[];
  permissions: PermissionRow[];
}): AccessDiagnosis {
  const caRows = input.clientAccess ?? [];
  const permRows = input.permissions ?? [];
  const hasClientAccess = caRows.some((r) => !r.revoked_at);
  const hasPermission = permRows.some((r) => !r.revoked_at);
  const event_type: AccessDiagnosisEventType =
    hasClientAccess || hasPermission ? "missing_workspace" : "unknown_email";
  return {
    event_type,
    has_client_access: hasClientAccess,
    has_permission: hasPermission,
    metadata: {
      client_access_rows: caRows.length,
      client_access_stripe_confirmed: caRows.some(
        (r) => !!r.stripe_session_id && !r.revoked_at,
      ),
      permission_rows: permRows.length,
      permission_project_ids: permRows
        .map((r) => r.project_id)
        .filter((v): v is string => !!v),
    },
  };
}

// Correlation IDs let us trace a single magic-link flow across telemetry rows.
// Format: "prt_" + 24 hex chars (12 bytes) — short but collision-safe.
export function generateCorrelationId(): string {
  const bytes = new Uint8Array(12);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `prt_${hex}`;
}

const CORRELATION_ID_RE = /^prt_[a-f0-9]{16,64}$/i;
export function normalizeCorrelationId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return CORRELATION_ID_RE.test(trimmed) ? trimmed : null;
}
