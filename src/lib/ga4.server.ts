/**
 * GA4 Data API access for the internal analytics snapshot.
 *
 * Runs on Cloudflare Workers, so the service account JWT is signed with Web
 * Crypto rather than a Node-only Google client library. Credentials are read
 * per call and never leave the server.
 */

import process from "node:process";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const GA4_PROPERTY_ID = "515344531";

export type GaSnapshot = {
  range: { start: string; end: string };
  totals: { sessions: number; activeUsers: number; screenPageViews: number };
  topPages: Array<{ path: string; views: number }>;
  topChannels: Array<{ channel: string; sessions: number }>;
  refreshedAt: string;
};

type ServiceAccount = { client_email: string; private_key: string };

function readServiceAccount(): ServiceAccount {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return parsed;
}

function base64url(bytes: Uint8Array | string): string {
  const b =
    typeof bytes === "string"
      ? btoa(bytes)
      : btoa(String.fromCharCode(...Array.from(bytes)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function mintAccessToken(): Promise<string> {
  const sa = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  const assertion = `${signingInput}.${base64url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed [${response.status}]: ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token exchange returned no access token");
  return json.access_token;
}

type RunReportBody = Record<string, unknown>;

type ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
};

async function runReport(token: string, body: RunReportBody): Promise<ReportResponse> {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`GA4 report failed [${response.status}]: ${await response.text()}`);
  }
  return (await response.json()) as ReportResponse;
}

const num = (v?: string) => {
  const n = Number(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

// Small in-process cache so page loads read a snapshot rather than calling Google.
let cache: { at: number; data: GaSnapshot } | null = null;
const TTL_MS = 15 * 60 * 1000;

export async function getGaSnapshot(): Promise<GaSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const token = await mintAccessToken();
  const dateRanges = [{ startDate: "28daysAgo", endDate: "today" }];

  const [totalsReport, pagesReport, channelsReport] = await Promise.all([
    runReport(token, {
      dateRanges,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "screenPageViews" },
      ],
    }),
    runReport(token, {
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    runReport(token, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 8,
    }),
  ]);

  const totalRow = totalsReport.rows?.[0]?.metricValues ?? [];
  const data: GaSnapshot = {
    range: { start: "28 days ago", end: "today" },
    totals: {
      sessions: num(totalRow[0]?.value),
      activeUsers: num(totalRow[1]?.value),
      screenPageViews: num(totalRow[2]?.value),
    },
    topPages: (pagesReport.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "(unknown)",
      views: num(r.metricValues?.[0]?.value),
    })),
    topChannels: (channelsReport.rows ?? []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value ?? "(unknown)",
      sessions: num(r.metricValues?.[0]?.value),
    })),
    refreshedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), data };
  return data;
}

/** Constant-time-ish comparison for the internal access passcode. */
export function passcodeMatches(supplied: string): boolean {
  const expected = process.env["OPS_ANALYTICS_KEY"] ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}
