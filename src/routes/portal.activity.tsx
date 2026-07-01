import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  CreditCard,
  Receipt,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  MessageSquare,
  Folder,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalContext } from "@/hooks/use-portal-context";
import {
  PortalPage,
  PortalCard,
  PortalPageHeader,
} from "@/components/portal/PortalPage";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/portal/activity")({
  ssr: false,
  component: ActivityPage,
});

type ActivityRow = {
  id: string;
  event_type: string;
  summary: string;
  actor_type: string;
  actor_email: string | null;
  metadata: Json;
  created_at: string;
};

type Filter = "all" | "billing" | "subscription" | "other";

function ActivityPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useQuery({
    queryKey: ["portal", "activity", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [] as ActivityRow[];
      const { data, error } = await supabase
        .from("client_portal_activity")
        .select("id, event_type, summary, actor_type, actor_email, metadata, created_at")
        .eq("project_id", projectId)
        .eq("client_visible", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  // Realtime: reflect new activity as it lands.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`portal-activity-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_portal_activity",
          filter: `project_id=eq.${projectId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["portal", "activity", projectId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  const events = query.data ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => categoryOf(e.event_type) === filter);
  }, [events, filter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <PortalPage width="4xl">
      <PortalPageHeader
        eyebrow="Activity"
        title="Activity and history"
        description="A running timeline of billing, subscription, and workspace events for your engagement."
        right={
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="border-ink/20 text-ink"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${query.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: "All" },
            { id: "billing", label: "Billing" },
            { id: "subscription", label: "Subscription" },
            { id: "other", label: "Workspace" },
          ] as { id: Filter; label: string }[]
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${
                active
                  ? "bg-ink text-white border-ink"
                  : "bg-card text-ink/70 border-rule-soft hover:bg-paper-soft"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <PortalCard className="p-0 overflow-hidden">
        {query.isLoading ? (
          <div className="p-10 flex items-center justify-center text-ink/60">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : query.isError ? (
          <div className="p-10 text-center">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" />
            <p className="text-[13.5px] text-ink/70">Couldn't load activity.</p>
            <Button
              variant="outline"
              className="mt-3 border-ink/20 text-ink"
              onClick={() => query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ActivityIcon className="w-6 h-6 mx-auto mb-2 text-ink/40" />
            <p className="font-display text-lg text-ink">No activity yet</p>
            <p className="text-[13.5px] text-ink/60 mt-1">
              Events will appear here as your engagement progresses.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-rule-soft">
            {grouped.map(([date, rows]) => (
              <li key={date}>
                <div className="px-5 sm:px-8 py-3 bg-paper-soft/60 text-[11px] uppercase tracking-[0.24em] font-mono text-ink/50 border-b border-rule-soft">
                  {date}
                </div>
                <ul className="relative">
                  {rows.map((e, idx) => (
                    <TimelineItem key={e.id} event={e} isLast={idx === rows.length - 1} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </PortalCard>
    </PortalPage>
  );
}

function TimelineItem({ event, isLast }: { event: ActivityRow; isLast: boolean }) {
  const cat = categoryOf(event.event_type);
  const Icon = iconFor(event.event_type, cat);
  const tone = toneFor(event.event_type, cat);
  const time = new Date(event.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const meta = event.metadata as Record<string, unknown> | null;
  const amount = typeof meta?.amount === "number" ? meta.amount : null;
  const currency = typeof meta?.currency === "string" ? meta.currency : "usd";

  return (
    <li className="relative px-5 sm:px-8 py-4 flex gap-4">
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[38px] sm:left-[50px] top-11 bottom-0 w-px bg-rule-soft"
        />
      )}
      <div
        className={`relative z-10 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border ${tone.badge}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-medium text-ink">{event.summary}</span>
          {amount !== null && (
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-paper-soft border border-rule-soft text-ink/70">
              {formatMoney(amount, currency)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink/50">
          <span title={new Date(event.created_at).toLocaleString()}>{time}</span>
          <span aria-hidden="true">·</span>
          <span className="uppercase tracking-wider">{prettyEvent(event.event_type)}</span>
          {event.actor_email && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{event.actor_email}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function categoryOf(eventType: string): Filter {
  const t = eventType.toLowerCase();
  if (t.includes("invoice") || t.includes("payment") || t.includes("billing")) return "billing";
  if (t.includes("subscription") || t.includes("plan")) return "subscription";
  return "other";
}

function iconFor(eventType: string, cat: Filter) {
  const t = eventType.toLowerCase();
  if (t.includes("invoice") || t.includes("receipt")) return Receipt;
  if (cat === "billing") return CreditCard;
  if (cat === "subscription") return Sparkles;
  if (t.includes("message")) return MessageSquare;
  if (t.includes("file")) return Folder;
  if (t.includes("access") || t.includes("user")) return UserIcon;
  return ActivityIcon;
}

function toneFor(eventType: string, _cat: Filter) {
  const t = eventType.toLowerCase();
  if (t.includes("failed") || t.includes("revoked") || t.includes("canceled"))
    return { badge: "bg-destructive/10 text-destructive border-destructive/30" };
  if (t.includes("paid") || t.includes("succeeded") || t.includes("active"))
    return { badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (t.includes("invoice") || t.includes("payment") || t.includes("billing"))
    return { badge: "bg-royal/10 text-royal border-royal/20" };
  return { badge: "bg-paper-soft text-ink/70 border-rule-soft" };
}

function prettyEvent(eventType: string) {
  return eventType.replace(/[._]/g, " ");
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function groupByDate(rows: ActivityRow[]): [string, ActivityRow[]][] {
  const map = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const key = new Date(r.created_at).toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const bucket = map.get(key) ?? [];
    bucket.push(r);
    map.set(key, bucket);
  }
  return Array.from(map.entries());
}

// Silence unused warning when CheckCircle2 is not referenced yet.
void CheckCircle2;
