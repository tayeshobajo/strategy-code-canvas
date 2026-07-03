import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Calendar as CalendarIcon,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalContext } from "@/hooks/use-portal-context";
import {
  PortalPage,
  PortalCard,
  PortalPageHeader,
} from "@/components/portal/PortalPage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type Category =
  | "follow_up"
  | "roadmap"
  | "files"
  | "messages"
  | "billing"
  | "subscription"
  | "workspace";
const ALL_CATEGORIES: Category[] = [
  "follow_up",
  "roadmap",
  "files",
  "messages",
  "billing",
  "subscription",
  "workspace",
];


type DateRange = "7d" | "30d" | "90d" | "all";
const DATE_RANGE_LABEL: Record<DateRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const PAGE_SIZE = 50;

function sinceIso(range: DateRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function ActivityPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const qc = useQueryClient();

  const [categories, setCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [range, setRange] = useState<DateRange>("30d");
  const since = useMemo(() => sinceIso(range), [range]);

  const queryKey = ["portal", "activity", projectId, range] as const;

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    enabled: !!projectId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!projectId) return [] as ActivityRow[];
      let q = supabase
        .from("client_portal_activity")
        .select("id, event_type, summary, actor_type, actor_email, metadata, created_at")
        .eq("project_id", projectId)
        .eq("client_visible", true)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (since) q = q.gte("created_at", since);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []) as ActivityRow[];
    },
    getNextPageParam: (last) =>
      last.length === PAGE_SIZE ? last[last.length - 1].created_at : undefined,
  });

  // Realtime: new events prepend at the top; refresh first page.
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

  const allEvents = useMemo(
    () => (data?.pages ?? []).flat() as ActivityRow[],
    [data],
  );

  const filtered = useMemo(() => {
    if (categories.size === ALL_CATEGORIES.length) return allEvents;
    return allEvents.filter((e) => categories.has(categoryOf(e.event_type)));
  }, [allEvents, categories]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  // Sentinel-based infinite scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const toggleCategory = useCallback((c: Category) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      // Never allow zero — treat empty as "all" reset for usability.
      if (next.size === 0) return new Set(ALL_CATEGORIES);
      return next;
    });
  }, []);

  const allSelected = categories.size === ALL_CATEGORIES.length;

  return (
    <PortalPage width="4xl">
      <PortalPageHeader
        eyebrow="Activity"
        title="Activity and history"
        description="A running timeline of billing, subscription, and workspace events for your engagement."
        right={
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-ink/20 text-ink"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="Activity filters"
      >
        <FilterChip
          active={allSelected}
          onClick={() => setCategories(new Set(ALL_CATEGORIES))}
          label="All"
        />
        {ALL_CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            active={!allSelected && categories.has(c)}
            onClick={() => toggleCategory(c)}
            label={categoryLabel(c)}
          />
        ))}

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-rule-soft text-ink/80 h-8"
                aria-label={`Date range: ${DATE_RANGE_LABEL[range]}`}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {DATE_RANGE_LABEL[range]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Date range</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(DATE_RANGE_LABEL) as DateRange[]).map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => setRange(r)}
                  className="flex items-center justify-between"
                >
                  <span>{DATE_RANGE_LABEL[r]}</span>
                  {range === r && <Check className="w-3.5 h-3.5 text-royal" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <PortalCard className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex items-center justify-center text-ink/60">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-10 text-center">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" />
            <p className="text-[13.5px] text-ink/70">Couldn't load activity.</p>
            <Button
              variant="outline"
              className="mt-3 border-ink/20 text-ink"
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ActivityIcon className="w-6 h-6 mx-auto mb-2 text-ink/40" />
            <p className="font-display text-lg text-ink">No activity in this range</p>
            <p className="text-[13.5px] text-ink/60 mt-1">
              Try widening the date range or clearing filters.
            </p>
          </div>
        ) : (
          <>
            <ol className="divide-y divide-rule-soft" aria-live="polite">
              {grouped.map(([date, rows]) => (
                <li key={date}>
                  <div className="px-5 sm:px-8 py-3 bg-paper-soft/60 text-[11px] uppercase tracking-[0.24em] font-mono text-ink/50 border-b border-rule-soft">
                    {date}
                  </div>
                  <ul className="relative">
                    {rows.map((e, idx) => (
                      <TimelineItem
                        key={e.id}
                        event={e}
                        isLast={idx === rows.length - 1}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>

            {/* Infinite scroll footer */}
            <div
              ref={sentinelRef}
              className="px-5 sm:px-8 py-5 flex items-center justify-center text-[12px] text-ink/50 border-t border-rule-soft"
            >
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…
                </span>
              ) : hasNextPage ? (
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  className="text-royal hover:underline"
                >
                  Load more
                </button>
              ) : (
                <span>End of timeline · {filtered.length} events</span>
              )}
            </div>
          </>
        )}
      </PortalCard>
    </PortalPage>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${
        active
          ? "bg-ink text-white border-ink"
          : "bg-card text-ink/70 border-rule-soft hover:bg-paper-soft"
      }`}
    >
      {label}
    </button>
  );
}

function categoryLabel(c: Category) {
  return c === "billing" ? "Billing" : c === "subscription" ? "Subscription" : "Workspace";
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

function categoryOf(eventType: string): Category {
  const t = eventType.toLowerCase();
  if (t.startsWith("follow_up")) return "follow_up";
  if (t.startsWith("roadmap") || t.includes("engagement")) return "roadmap";
  if (t.startsWith("file")) return "files";
  if (t.startsWith("message") || t.includes("reply")) return "messages";
  if (t.includes("invoice") || t.includes("payment") || t.includes("billing")) return "billing";
  if (t.includes("subscription") || t.includes("plan")) return "subscription";
  return "workspace";
}

function iconFor(eventType: string, cat: Category) {
  const t = eventType.toLowerCase();
  if (cat === "follow_up") return AlertCircle;
  if (t.includes("invoice") || t.includes("receipt")) return Receipt;
  if (cat === "billing") return CreditCard;
  if (cat === "subscription") return Sparkles;
  if (cat === "messages") return MessageSquare;
  if (cat === "files") return Folder;
  if (cat === "roadmap") return Sparkles;
  if (t.includes("access") || t.includes("user")) return UserIcon;
  return ActivityIcon;
}

function toneFor(eventType: string, cat: Category) {
  const t = eventType.toLowerCase();
  if (cat === "follow_up" && !t.includes("resolved"))
    return { badge: "bg-amber-50 text-amber-700 border-amber-200" };
  if (t.includes("failed") || t.includes("revoked") || t.includes("canceled"))
    return { badge: "bg-destructive/10 text-destructive border-destructive/30" };
  if (t.includes("paid") || t.includes("succeeded") || t.includes("active") || t.includes("acknowledged") || t.includes("resolved"))
    return { badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (cat === "roadmap") return { badge: "bg-royal/10 text-royal border-royal/20" };
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

void CheckCircle2;
