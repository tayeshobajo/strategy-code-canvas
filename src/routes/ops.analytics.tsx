import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchGaSnapshot } from "@/lib/ga4.functions";

export const Route = createFileRoute("/ops/analytics")({
  head: () => ({
    meta: [
      { title: "Internal Analytics | Trust Tai" },
      { name: "description", content: "Internal GA4 snapshot for trusttai.com." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Internal Analytics | Trust Tai" },
      { property: "og:description", content: "Internal GA4 snapshot for trusttai.com." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpsAnalytics,
});

type Snapshot = Awaited<ReturnType<typeof fetchGaSnapshot>>;

function OpsAnalytics() {
  const run = useServerFn(fetchGaSnapshot);
  const [passcode, setPasscode] = React.useState("");
  const [data, setData] = React.useState<Snapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function load(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setData(await run({ data: { passcode } }));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <main id="main" className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-foreground">Internal analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GA4 property 515344531, last 28 days. Cached for 15 minutes.
        </p>

        <form onSubmit={load} className="mt-6 flex flex-wrap gap-2">
          <label htmlFor="passcode" className="sr-only">
            Access passcode
          </label>
          <input
            id="passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Access passcode"
            className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={loading || !passcode}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Loading" : "Load snapshot"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {data && (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-sm font-medium text-muted-foreground">Totals</h2>
              <dl className="mt-2 grid grid-cols-3 gap-3">
                {[
                  ["Sessions", data.totals.sessions],
                  ["Active users", data.totals.activeUsers],
                  ["Page views", data.totals.screenPageViews],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border p-4">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h2 className="text-sm font-medium text-muted-foreground">Top pages</h2>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {data.topPages.map((p) => (
                  <li key={p.path} className="flex justify-between px-4 py-2 text-sm">
                    <span className="truncate text-foreground">{p.path}</span>
                    <span className="text-muted-foreground">{p.views}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-medium text-muted-foreground">Channels</h2>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {data.topChannels.map((c) => (
                  <li key={c.channel} className="flex justify-between px-4 py-2 text-sm">
                    <span className="text-foreground">{c.channel}</span>
                    <span className="text-muted-foreground">{c.sessions}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="text-xs text-muted-foreground">
              Refreshed {new Date(data.refreshedAt).toLocaleString()}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
