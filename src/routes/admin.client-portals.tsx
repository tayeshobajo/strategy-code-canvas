import { createFileRoute } from "@tanstack/react-router";
import { useState, Suspense } from "react";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListPortals,
  adminGetPortal,
  adminUpdatePortal,
} from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/client-portals")({
  component: () => (
    <Suspense fallback={<div className="text-white/60">Loading…</div>}>
      <AdminClientPortals />
    </Suspense>
  ),
});

const STATUSES = [
  "payment_confirmed",
  "access_sent",
  "onboarding_pending",
  "onboarding_complete",
  "roadmap_in_progress",
  "roadmap_ready",
  "roadmap_delivered",
  "engagement_active",
  "engagement_complete",
  "access_revoked",
];

const PHASES = [
  "Awaiting onboarding",
  "Onboarding",
  "Roadmap drafting",
  "Roadmap ready",
  "Delivery",
  "Post-engagement",
];

function AdminClientPortals() {
  const listFn = useServerFn(adminListPortals);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["admin", "portals"],
      queryFn: () => listFn({}),
    }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    data.projects[0]?.id ?? null,
  );

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6 h-[calc(100vh-4rem)]">
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-y-auto">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-amber-400">
            Client portals
          </h2>
          <span className="text-xs text-white/50">{data.projects.length}</span>
        </div>
        <ul>
          {data.projects.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 ${selectedId === p.id ? "bg-white/10" : ""}`}
              >
                <div className="text-sm text-white">
                  {p.contact_name ?? p.primary_email}
                </div>
                <div className="text-xs text-white/50 mt-0.5 flex items-center gap-2">
                  <span>{p.company_name ?? "—"}</span>
                  <span>·</span>
                  <span className="text-amber-400/80">
                    {p.portal_status?.replace(/_/g, " ")}
                  </span>
                </div>
              </button>
            </li>
          ))}
          {data.projects.length === 0 && (
            <li className="px-4 py-6 text-sm text-white/60">
              No portals yet. Portals appear after Stripe confirms payment.
            </li>
          )}
        </ul>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-y-auto">
        {selectedId ? (
          <PortalDetail id={selectedId} key={selectedId} />
        ) : (
          <div className="p-8 text-white/50">Select a portal to manage it.</div>
        )}
      </div>
    </div>
  );
}

function PortalDetail({ id }: { id: string }) {
  const getFn = useServerFn(adminGetPortal);
  const updateFn = useServerFn(adminUpdatePortal);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "portal", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateFn({ data: { id, ...patch } as never }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "portal", id] });
      await qc.invalidateQueries({ queryKey: ["admin", "portals"] });
    },
  });

  if (isLoading || !data) return <div className="p-8 text-white/60">Loading…</div>;
  const p = data.project;
  if (!p) return <div className="p-8 text-white/60">Not found.</div>;

  return (
    <div className="p-8 space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-amber-400">
          {p.package_name ?? "Engagement"}
        </div>
        <h1 className="text-2xl mt-1" style={{ fontFamily: "Georgia, serif" }}>
          {p.contact_name ?? p.primary_email}
        </h1>
        <div className="text-sm text-white/60 mt-1">
          {p.company_name ? p.company_name + " · " : ""}
          {p.primary_email}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6">
        <FieldSelect
          label="Portal status (client-facing)"
          value={p.portal_status}
          options={STATUSES}
          onChange={(v) => mutation.mutate({ portal_status: v })}
        />
        <FieldSelect
          label="Current phase"
          value={p.current_phase ?? ""}
          options={PHASES}
          onChange={(v) => mutation.mutate({ current_phase: v })}
        />
        <FieldText
          label="Next milestone"
          value={p.next_milestone ?? ""}
          placeholder="e.g. Kickoff call"
          onSave={(v) => mutation.mutate({ next_milestone: v || null })}
        />
        <FieldText
          label="Next milestone due (YYYY-MM-DD)"
          value={
            p.next_milestone_due_at
              ? p.next_milestone_due_at.substring(0, 10)
              : ""
          }
          placeholder="2025-01-15"
          onSave={(v) =>
            mutation.mutate({
              next_milestone_due_at: v ? new Date(v).toISOString() : null,
            })
          }
        />
        <FieldText
          label="Scheduling URL"
          value={p.scheduling_url ?? ""}
          placeholder="https://cal.com/tai/…"
          onSave={(v) => mutation.mutate({ scheduling_url: v || null })}
        />
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-amber-400 mb-3">
          Onboarding
        </h3>
        <div className="rounded-lg bg-black/30 p-4 text-sm">
          <div>
            Step: <span className="text-white">{data.onboarding?.current_step ?? "—"}</span>
          </div>
          <div>
            Submitted:{" "}
            <span className="text-white">
              {data.onboarding?.submitted_at
                ? new Date(data.onboarding.submitted_at).toLocaleString()
                : "—"}
            </span>
          </div>
          <div>
            Completion:{" "}
            <span className="text-white">
              {data.onboarding?.completion_percent ?? 0}%
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-amber-400 mb-3">
          Approved Roadmap (client-facing)
        </h3>
        <Select
          value={p.approved_roadmap_id ?? "none"}
          onValueChange={(v) =>
            mutation.mutate({ approved_roadmap_id: v === "none" ? null : v })
          }
        >
          <SelectTrigger className="bg-black/30 border-white/10 text-white">
            <SelectValue placeholder="Attach approved roadmap" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (unpublish)</SelectItem>
            {data.roadmaps.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title} · {r.status}
                {r.approved_at ? " · approved" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-white/50 mt-2">
          Only Roadmap versions attached here are visible to the client. Internal
          drafts and reviewer notes never sync into the portal.
        </p>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-amber-400 mb-3">
          Recent activity (internal)
        </h3>
        <ul className="divide-y divide-white/5 text-sm rounded-lg bg-black/30">
          {data.activity.slice(0, 12).map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <div className="text-white">{a.summary}</div>
              <div className="text-xs text-white/50">
                {new Date(a.created_at).toLocaleString()} · {a.actor_type}
                {a.actor_email ? ` · ${a.actor_email}` : ""}
              </div>
            </li>
          ))}
          {data.activity.length === 0 && (
            <li className="px-4 py-3 text-white/50">No activity yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-widest text-amber-400 mb-3">
          Billing
        </h3>
        <ul className="divide-y divide-white/5 text-sm rounded-lg bg-black/30">
          {data.billing.map((b) => (
            <li key={b.id} className="px-4 py-2.5 flex justify-between">
              <span>
                {b.purchased_package ?? "payment"} · {b.payment_status}
              </span>
              <span className="text-white/70">
                {b.amount_total != null
                  ? `$${(b.amount_total / 100).toFixed(2)} ${b.currency?.toUpperCase() ?? ""}`
                  : ""}
              </span>
            </li>
          ))}
          {data.billing.length === 0 && (
            <li className="px-4 py-3 text-white/50">No billing records.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function FieldText({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-widest">
        {label}
      </Label>
      <div className="flex gap-2 mt-2">
        <Input
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          className="bg-black/30 border-white/10 text-white"
        />
        <Button
          type="button"
          onClick={() => onSave(v)}
          disabled={v === value}
          className="bg-amber-500 hover:bg-amber-400 text-slate-900"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-white/70 text-xs uppercase tracking-widest">
        {label}
      </Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="bg-black/30 border-white/10 text-white mt-2">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
