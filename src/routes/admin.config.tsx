import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getRuntimeConfig } from "@/lib/runtime-config.functions";

export const Route = createFileRoute("/admin/config")({
  ssr: false,
  component: ConfigPage,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-white/10 py-3 text-sm">
      <div className="text-white/60">{label}</div>
      <div className="col-span-2 font-mono text-white break-all">{value}</div>
    </div>
  );
}

function ConfigPage() {
  const fetchConfig = useServerFn(getRuntimeConfig);
  const { data, isLoading, error } = useQuery({
    queryKey: ["runtime-config"],
    queryFn: () => fetchConfig(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Runtime config</h1>
      <p className="text-white/60 text-sm mb-6">
        Live values the deployed app is using right now. Verify these match the
        active domain in production.
      </p>

      {isLoading && <div className="text-white/60">Loading…</div>}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          Could not load config. {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <Row label="Public site URL (resolved)" value={data.publicSiteUrl} />
          <Row label="Canonical origin" value={data.canonicalOrigin} />
          <Row
            label="PUBLIC_SITE_URL env"
            value={data.publicSiteUrlEnvSet ? "set" : "unset (using canonical)"}
          />
          <Row label="Request origin" value={data.requestOrigin ?? "—"} />
          <Row label="Sender domain" value={data.senderDomain} />
          <Row label="From address" value={data.fromAddress} />
          <Row label="Contact email" value={data.contactEmail} />
          <Row label="Ops notify email" value={data.opsNotifyEmail} />
          <Row label="Node env" value={data.nodeEnv} />
          <Row
            label="Legacy hosts (auto-redirected)"
            value={data.legacyHosts.join(", ")}
          />
        </div>
      )}
    </div>
  );
}
