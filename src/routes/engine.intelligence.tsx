import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { Database, Link2, Lightbulb, Calendar, Clock, Gauge, Download, Upload, GitMerge, Sparkles, MoreHorizontal, X, RefreshCw, Plus } from "lucide-react";
import {
  listIntelligenceMemory,
  bulkReplaceIntelligenceMemory,
  upsertIntelligenceMemory,
  type MemoryRow,
} from "@/lib/engine-intelligence.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/engine/intelligence")({
  component: IntelligenceMemoryPage,
});


type MemType = "Client Truth" | "Insight" | "Decision" | "Requirement" | "Opportunity" | "Constraint" | "Risk" | "Preference";

type Item = {
  id: string;
  title: string;
  summary: string;
  type: MemType;
  project: string;
  source: string;
  sourceDate: string;
  captured: string;
  confidence: number;
  tags: string[];
  usedIn: string;
};

const KNOWN_TYPES: MemType[] = ["Client Truth", "Insight", "Decision", "Requirement", "Opportunity", "Constraint", "Risk", "Preference"];

function toItem(r: MemoryRow): Item {
  const t = (KNOWN_TYPES as string[]).includes(r.type) ? (r.type as MemType) : "Insight";
  const captured = r.captured_at ? new Date(r.captured_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const sourceDate = r.source_date ? new Date(r.source_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? "",
    type: t,
    project: r.project_id ? r.project_id.slice(0, 8) : "—",
    source: r.source ?? "—",
    sourceDate,
    captured,
    confidence: r.confidence,
    tags: r.tags ?? [],
    usedIn: r.used_in ?? "—",
  };
}

const TABS: (MemType | "All Memory" | "Insights")[] = ["All Memory", "Insights", "Client Truth", "Decision", "Constraint", "Opportunity", "Risk", "Preference"];


const TYPE_STYLE: Record<MemType, string> = {
  "Client Truth": "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
  "Insight": "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
  "Decision": "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
  "Requirement": "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
  "Opportunity": "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  "Constraint": "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  "Risk": "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  "Preference": "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
};

function confidenceMeta(c: number) {
  if (c >= 85) return { label: "High", dot: "bg-[#1f6b3b]" };
  if (c >= 75) return { label: "High", dot: "bg-[#1f6b3b]" };
  if (c >= 70) return { label: "Medium", dot: "bg-[#c99a20]" };
  return { label: "Low", dot: "bg-[#a4283c]" };
}

type BulkDiff = { removeIds: string[]; inserts: NewMemoryInput[] };
type NewMemoryInput = {
  project_id?: string | null;
  title: string;
  summary?: string | null;
  type: string;
  source?: string | null;
  source_date?: string | null;
  confidence?: number;
  tags?: string[];
  used_in?: string | null;
};

function IntelligenceMemoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All Memory");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);

  const queryClient = useQueryClient();
  const listFn = useServerFn(listIntelligenceMemory);
  const bulkFn = useServerFn(bulkReplaceIntelligenceMemory);
  const upsertFn = useServerFn(upsertIntelligenceMemory);

  const memoryQuery = useQuery({
    queryKey: ["intelligence-memory"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  const items = useMemo<Item[]>(
    () => (memoryQuery.data ?? []).map(toItem),
    [memoryQuery.data],
  );

  const bulkMut = useMutation({
    mutationFn: (diff: BulkDiff) => bulkFn({ data: diff }),
    onSuccess: (r) => {
      toast.success(`Memory updated · removed ${r.removed}, added ${r.inserted}`);
      queryClient.invalidateQueries({ queryKey: ["intelligence-memory"] });
      setMergeOpen(false);
      setCleanOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update memory"),
  });

  const rows = tab === "All Memory" || tab === "Insights" ? items : items.filter((i) => i.type === tab);

  const totalItems = items.length;
  const avgConfidence = items.length ? Math.round(items.reduce((s, i) => s + i.confidence, 0) / items.length) : 0;
  const lastUpdated = memoryQuery.data && memoryQuery.data.length ? new Date(memoryQuery.data[0].captured_at) : null;
  const firstCaptured = memoryQuery.data && memoryQuery.data.length
    ? new Date(memoryQuery.data[memoryQuery.data.length - 1].captured_at)
    : null;
  const projectCount = new Set(items.map((i) => i.project).filter((p) => p !== "—")).size;

  const [newOpen, setNewOpen] = useState(false);
  const upsertMut = useMutation({
    mutationFn: (payload: NewMemoryInput) => upsertFn({ data: payload as NewMemoryInput & { title: string; type: string } }),
    onSuccess: () => {
      toast.success("Memory item added");
      queryClient.invalidateQueries({ queryKey: ["intelligence-memory"] });
      setNewOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to add memory item"),
  });

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Memory</div>
          <h1 className="font-display text-4xl text-ink mt-1 mb-2">Intelligence Memory</h1>
          <p className="text-ink/60 mb-6">The living memory of all project intelligence. Organized, connected, and always ready to inform better decisions.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => memoryQuery.refetch()}
            className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 text-ink/80 hover:border-royal/50"
            disabled={memoryQuery.isFetching}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", memoryQuery.isFetching && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs bg-royal text-white rounded-md px-2.5 py-1.5 hover:bg-royal/90"
          >
            <Plus className="w-3.5 h-3.5" /> New Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Total Items" value={String(totalItems)} tone="purple" hint={<span className="flex items-center gap-1"><Database className="w-3 h-3" />Across all projects</span>} />
        <MetricCard label="Projects" value={projectCount} tone="blue" hint={<span className="flex items-center gap-1"><Link2 className="w-3 h-3" />With memory</span>} />
        <MetricCard label="Insights" value={items.filter((i) => i.type === "Insight").length} tone="orange" hint={<span className="flex items-center gap-1"><Lightbulb className="w-3 h-3" />Total</span>} />
        <MetricCard label="First Captured" value={firstCaptured ? firstCaptured.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} tone="default" hint={<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{firstCaptured ? firstCaptured.getFullYear() : ""}</span>} />
        <MetricCard label="Last Updated" value={lastUpdated ? lastUpdated.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} tone="default" hint={<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lastUpdated ? lastUpdated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</span>} />
        <MetricCard label="Avg Confidence" value={`${avgConfidence}%`} tone="green" hint={<span className="flex items-center gap-1"><Gauge className="w-3 h-3" />Across all items</span>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <SectionCard
          title={
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border",
                    tab === t ? "bg-ink text-white border-ink" : "border-transparent text-ink/70 hover:border-border",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Title / Summary</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Confidence</th>
                  <th className="px-3 py-2.5">Tags</th>
                  <th className="px-3 py-2.5">Used In</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {memoryQuery.isLoading ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-ink/50 text-sm">Loading memory…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-ink/50 text-sm">
                    No memory items yet. Click "New Item" to promote an insight into memory.
                  </td></tr>
                ) : rows.map((it) => {
                  const c = confidenceMeta(it.confidence);
                  return (
                    <tr key={it.id} className="border-b border-border/60 hover:bg-paper-soft/40 align-top">
                      <td className="px-5 py-3 max-w-[300px]">
                        <div className="font-medium text-ink">{it.title}</div>
                        <div className="text-xs text-ink/60">{it.summary}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap", TYPE_STYLE[it.type])}>{it.type}</span>
                      </td>
                      <td className="px-3 py-3 text-ink/80 whitespace-nowrap font-mono text-xs">{it.project}</td>
                      <td className="px-3 py-3">
                        <div className="text-ink/80">{it.source}</div>
                        <div className="text-xs text-ink/60">{it.sourceDate}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
                          <span className="text-ink">{c.label}</span>
                          <span className="text-xs text-ink/60">{it.confidence}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {it.tags.map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-paper-soft border border-border text-ink/70">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink/70">{it.usedIn}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => bulkMut.mutate({ removeIds: [it.id], inserts: [] })}
                          className="p-1 rounded hover:bg-paper-soft text-ink/60"
                          title="Archive item"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Memory Connections">
            <ConnectionsGraph />
            <ul className="mt-3 space-y-1.5 text-xs">
              {(["Client Truth", "Decision", "Requirement", "Constraint", "Opportunity", "Risk"] as MemType[]).map((t) => (
                <LegendRow
                  key={t}
                  color={{ "Client Truth": "#1f6b3b", "Decision": "#2842a4", "Requirement": "#5435a4", "Constraint": "#a4283c", "Opportunity": "#c99a20", "Risk": "#8a6713", "Insight": "#2842a4", "Preference": "#5435a4" }[t]}
                  label={`${t}s`}
                  value={items.filter((i) => i.type === t).length}
                />
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Recent Additions">
            <ul className="space-y-3 text-sm">
              {items.slice(0, 4).map((it) => (
                <RecentItem key={it.id} title={it.title} project={it.project} when={it.captured} />
              ))}
              {items.length === 0 ? (
                <li className="text-xs text-ink/50">No recent additions.</li>
              ) : null}
            </ul>
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickBtn icon={<Upload className="w-3.5 h-3.5" />} label="Import Source" />
              <QuickBtn icon={<Download className="w-3.5 h-3.5" />} label="Export Memory" />
              <QuickBtn icon={<GitMerge className="w-3.5 h-3.5" />} label="Merge Duplicates" onClick={() => setMergeOpen(true)} />
              <QuickBtn icon={<Sparkles className="w-3.5 h-3.5" />} label="Clean & Optimize" onClick={() => setCleanOpen(true)} />
            </div>
            {bulkMut.isPending ? <div className="mt-2 text-xs text-ink/50">Saving…</div> : null}
          </SectionCard>
        </div>
      </div>

      {mergeOpen ? (
        <MergeDuplicatesDialog
          items={items}
          pending={bulkMut.isPending}
          onClose={() => setMergeOpen(false)}
          onApply={(diff) => bulkMut.mutate(diff)}
        />
      ) : null}
      {cleanOpen ? (
        <CleanOptimizeDialog
          items={items}
          pending={bulkMut.isPending}
          onClose={() => setCleanOpen(false)}
          onApply={(diff) => bulkMut.mutate(diff)}
        />
      ) : null}
      {newOpen ? (
        <NewMemoryDialog
          pending={upsertMut.isPending}
          onClose={() => setNewOpen(false)}
          onSubmit={(payload) => upsertMut.mutate(payload)}
        />
      ) : null}
    </div>
  );
}


function QuickBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-2 hover:border-royal/50 text-ink justify-center">
      {icon}{label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Merge Duplicates: cluster by shared tags + title Jaccard similarity
// ─────────────────────────────────────────────────────────────
function tokenize(s: string) {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2),
  );
}
function jaccard(a: Set<string>, b: Set<string>) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

type DupCluster = { key: string; items: Item[]; similarity: number };

function findDuplicateClusters(items: Item[]): DupCluster[] {
  const clusters: DupCluster[] = [];
  const used = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue;
    const base = items[i];
    const baseTokens = tokenize(base.title + " " + base.summary);
    const matches: Item[] = [base];
    let bestSim = 0;
    for (let j = i + 1; j < items.length; j++) {
      const other = items[j];
      if (used.has(other.id)) continue;
      if (other.project !== base.project) continue;
      const sharedTags = other.tags.filter((t) => base.tags.includes(t)).length;
      const sim = jaccard(baseTokens, tokenize(other.title + " " + other.summary));
      if ((sharedTags >= 1 && sim >= 0.2) || sim >= 0.4) {
        matches.push(other);
        bestSim = Math.max(bestSim, sim);
      }
    }
    if (matches.length > 1) {
      matches.forEach((m) => used.add(m.id));
      clusters.push({ key: base.id, items: matches, similarity: bestSim });
    }
  }
  return clusters;
}

function mergeCluster(cluster: Item[]): Item {
  const primary = [...cluster].sort((a, b) => b.confidence - a.confidence)[0];
  const allTags = new Set<string>();
  cluster.forEach((c) => c.tags.forEach((t) => allTags.add(t)));
  return {
    ...primary,
    summary: primary.summary,
    tags: [...allTags],
    confidence: Math.min(99, Math.round(cluster.reduce((s, c) => s + c.confidence, 0) / cluster.length) + 3),
    usedIn: [...new Set(cluster.map((c) => c.usedIn).filter((u) => u && u !== "—"))].join(" · ") || primary.usedIn,
  };
}

function MergeDuplicatesDialog({ items, onClose, onApply, pending }: { items: Item[]; onClose: () => void; onApply: (diff: BulkDiff) => void; pending?: boolean }) {
  const clusters = useMemo(() => findDuplicateClusters(items), [items]);
  const [selected, setSelected] = useState<Set<string>>(new Set(clusters.map((c) => c.key)));
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(clusters.map((c) => c.key)));

  const toggleExpand = (key: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const apply = () => {
    const removeIds: string[] = [];
    const inserts: NewMemoryInput[] = [];
    for (const c of clusters) {
      if (!selected.has(c.key)) continue;
      c.items.forEach((it) => removeIds.push(it.id));
      const merged = mergeCluster(c.items);
      inserts.push({
        title: merged.title,
        summary: merged.summary,
        type: merged.type,
        source: merged.source === "—" ? null : merged.source,
        confidence: merged.confidence,
        tags: merged.tags,
        used_in: merged.usedIn === "—" ? null : merged.usedIn,
      });
    }
    onApply({ removeIds, inserts });
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">Merge Duplicates</div>
            <div className="text-xs text-ink/60">Grouped by shared tags and title similarity. Review each merge before applying.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink/70 cursor-pointer select-none">
              <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
              Compact
            </label>
            <button
              onClick={() => setExpanded(expanded.size === clusters.length ? new Set() : new Set(clusters.map((c) => c.key)))}
              className="text-[11px] text-ink/60 hover:text-ink border border-border rounded px-2 py-1"
            >
              {expanded.size === clusters.length ? "Collapse all" : "Expand all"}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
          </div>
        </header>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {clusters.length === 0 ? (
            <div className="text-center py-10 text-ink/50 text-sm">No duplicate clusters detected.</div>
          ) : (
            clusters.map((c) => {
              const merged = mergeCluster(c.items);
              const isSel = selected.has(c.key);
              const isOpen = expanded.has(c.key);
              return (
                <div key={c.key} className={cn("border rounded-lg overflow-hidden", isSel ? "border-royal" : "border-border")}>
                  <div className="flex items-center gap-2 p-3 bg-paper-soft border-b border-border">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(c.key); else next.delete(c.key);
                        setSelected(next);
                      }}
                    />
                    <button
                      onClick={() => toggleExpand(c.key)}
                      className="flex-1 min-w-0 text-left"
                      aria-expanded={isOpen}
                    >
                      <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                        <span className={cn("inline-block transition-transform", isOpen && "rotate-90")}>▸</span>
                        {c.items.length} similar items in {c.items[0].project}
                      </div>
                      <div className="text-xs text-ink/60 pl-4">Similarity ~{Math.round(c.similarity * 100)}%</div>
                    </button>
                  </div>
                  <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden">
                      <DiffPanel before={c.items} after={merged} compact={compact} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <footer className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-xs text-ink/60">{selected.size} of {clusters.length} clusters selected</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border text-ink/70">Cancel</button>
            <button
              onClick={apply}
              disabled={selected.size === 0 || pending}
              className="text-xs px-3 py-1.5 rounded bg-royal text-white hover:bg-royal/90 disabled:opacity-40"
            >
              {pending ? "Applying…" : `Apply ${selected.size} merge${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Clean & Optimize: drop low-confidence, unused, superseded items
// ─────────────────────────────────────────────────────────────
type CleanAction = { item: Item; reason: string };

function detectCleanActions(items: Item[]): CleanAction[] {
  const out: CleanAction[] = [];
  for (const it of items) {
    if (it.confidence < 60) out.push({ item: it, reason: `Low confidence (${it.confidence}%)` });
    else if ((!it.usedIn || it.usedIn === "—") && it.confidence < 75) out.push({ item: it, reason: "Never referenced anywhere" });
    else if (/old|prior|superseded/i.test(it.title + " " + it.summary)) out.push({ item: it, reason: "Marked as superseded" });
  }
  return out;
}

function CleanOptimizeDialog({ items, onClose, onApply, pending }: { items: Item[]; onClose: () => void; onApply: (diff: BulkDiff) => void; pending?: boolean }) {
  const actions = useMemo(() => detectCleanActions(items), [items]);
  const [selected, setSelected] = useState<Set<string>>(new Set(actions.map((a) => a.item.id)));

  const apply = () => {
    onApply({ removeIds: [...selected], inserts: [] });
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">Clean &amp; Optimize</div>
            <div className="text-xs text-ink/60">Low-confidence, unused, and superseded items flagged for removal.</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-4 overflow-y-auto flex-1">
          {actions.length === 0 ? (
            <div className="text-center py-10 text-ink/50 text-sm">Memory is already clean.</div>
          ) : (
            <ul className="space-y-3">
              {actions.map((a) => {
                const isSel = selected.has(a.item.id);
                return (
                  <li key={a.item.id} className={cn("border rounded-lg overflow-hidden", isSel ? "border-[#a4283c]" : "border-border")}>
                    <label className="flex items-center gap-2 p-3 bg-paper-soft border-b border-border cursor-pointer">
                      <input type="checkbox" checked={isSel}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(a.item.id); else next.delete(a.item.id);
                          setSelected(next);
                        }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink">{a.item.title}</div>
                        <div className="text-xs text-ink/60">{a.item.project} · <span className="text-[#a4283c]">{a.reason}</span></div>
                      </div>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                      <div className="p-3 border-r border-border">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60 mb-2">Before (kept)</div>
                        <div className="text-xs border border-border rounded p-2 bg-white space-y-0.5">
                          <div><span className="text-ink/50 font-mono text-[10px]">TITLE</span><div className="text-ink font-medium">{a.item.title}</div></div>
                          <div><span className="text-ink/50 font-mono text-[10px]">SUMMARY</span><div className="text-ink/70">{a.item.summary}</div></div>
                          <div className="flex gap-3"><span><span className="text-ink/50 font-mono text-[10px]">CONF</span> <span className="text-ink">{a.item.confidence}%</span></span>
                            <span><span className="text-ink/50 font-mono text-[10px]">TAGS</span> <span className="text-ink">{a.item.tags.join(", ")}</span></span></div>
                          <div><span className="text-ink/50 font-mono text-[10px]">USED IN</span> <span className="text-ink">{a.item.usedIn}</span></div>
                        </div>
                      </div>
                      <div className="p-3 bg-[#fbe9ec]/40">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#a4283c] mb-2">After (removed)</div>
                        <div className="text-xs border border-[#f3ced5] border-dashed rounded p-2 bg-white/50 text-ink/40">
                          <div className="line-through">{a.item.title}</div>
                          <div className="line-through">{a.item.summary}</div>
                          <div className="mt-2 text-[#a4283c] font-mono uppercase tracking-wider text-[10px] not-italic">✕ Item deleted from memory</div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-xs text-ink/60">{selected.size} of {actions.length} flagged for removal</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border text-ink/70">Cancel</button>
            <button
              onClick={apply}
              disabled={selected.size === 0 || pending}
              className="text-xs px-3 py-1.5 rounded bg-[#a4283c] text-white hover:bg-[#8a2033] disabled:opacity-40"
            >
              {pending ? "Removing…" : `Remove ${selected.size} item${selected.size === 1 ? "" : "s"}`}
            </button>

          </div>
        </footer>
      </div>
    </div>
  );
}




// ─────────────────────────────────────────────────────────────
// DiffPanel — field-by-field before/after diff for merge preview
// ─────────────────────────────────────────────────────────────
function DiffPanel({ before, after, compact = false }: { before: Item[]; after: Item; compact?: boolean }) {
  const primary = [...before].sort((a, b) => b.confidence - a.confidence)[0];
  const allTitles = Array.from(new Set(before.map((b) => b.title)));
  const allSummaries = Array.from(new Set(before.map((b) => b.summary)));
  const beforeTags = Array.from(new Set(before.flatMap((b) => b.tags)));
  const addedTags = after.tags.filter((t) => !primary.tags.includes(t));
  const beforeUsed = Array.from(new Set(before.map((b) => b.usedIn).filter((u) => u && u !== "—")));
  const confAvg = Math.round(before.reduce((s, b) => s + b.confidence, 0) / before.length);
  const confDelta = after.confidence - confAvg;
  const pad = compact ? "p-2" : "p-3";
  const gap = compact ? "space-y-1" : "space-y-2";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
      <div className={cn(pad, "border-r border-border bg-white")}>
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#a4283c] mb-2">Before · {before.length} items</div>
        <dl className={cn("text-xs", gap)}>
          <FieldRow label="Titles">
            {compact ? (
              <div className="text-ink truncate">{allTitles[0]}{allTitles.length > 1 ? ` +${allTitles.length - 1} more` : ""}</div>
            ) : (
              <ul className="space-y-0.5">{allTitles.map((t, i) => <li key={i} className="text-ink">• {t}</li>)}</ul>
            )}
          </FieldRow>
          {!compact ? (
            <FieldRow label="Summaries">
              <ul className="space-y-0.5">{allSummaries.map((s, i) => <li key={i} className="text-ink/70">• {s}</li>)}</ul>
            </FieldRow>
          ) : null}
          <FieldRow label="Tags">
            <div className="flex flex-wrap gap-1">
              {beforeTags.map((t) => <span key={t} className="text-[10px] bg-paper-soft border border-border rounded px-1.5 py-0.5">{t}</span>)}
            </div>
          </FieldRow>
          <FieldRow label="Confidence">
            <span className="text-ink">avg {confAvg}%{compact ? "" : (
              <span className="text-ink/50"> (range {Math.min(...before.map((b) => b.confidence))}–{Math.max(...before.map((b) => b.confidence))})</span>
            )}</span>
          </FieldRow>
          {!compact ? (
            <FieldRow label="Used in">
              <div className="text-ink/70">{beforeUsed.length > 0 ? beforeUsed.join(" · ") : "—"}</div>
            </FieldRow>
          ) : null}
        </dl>
      </div>
      <div className={cn(pad, "bg-[#f5fbf7]")}>
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#1f6b3b] mb-2">After · 1 merged item</div>
        <dl className={cn("text-xs", gap)}>
          <FieldRow label="Title"><div className="text-ink font-medium">{after.title}</div></FieldRow>
          {!compact ? <FieldRow label="Summary"><div className="text-ink/70">{after.summary}</div></FieldRow> : null}
          <FieldRow label="Tags">
            <div className="flex flex-wrap gap-1">
              {after.tags.map((t) => (
                <span key={t} className={cn("text-[10px] rounded px-1.5 py-0.5 border",
                  addedTags.includes(t) ? "bg-[#e6f5ec] border-[#c4e6d2] text-[#1f6b3b] font-medium" : "bg-paper-soft border-border")}>
                  {addedTags.includes(t) ? "+" : ""}{t}
                </span>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Confidence">
            <span className="text-ink font-medium">{after.confidence}%</span>
            {confDelta !== 0 ? (
              <span className={cn("ml-1 text-[10px]", confDelta > 0 ? "text-[#1f6b3b]" : "text-[#a4283c]")}>
                ({confDelta > 0 ? "+" : ""}{confDelta}%)
              </span>
            ) : null}
          </FieldRow>
          {!compact ? (
            <FieldRow label="Used in">
              <div className="text-ink/70">{after.usedIn}</div>
            </FieldRow>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-ink/50 pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink/80"><span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}</span>
      <span className="font-mono text-ink/60">{value}</span>
    </li>
  );
}

function RecentItem({ title, project, when }: { title: string; project: string; when: string }) {
  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-ink font-medium truncate">{title}</div>
        <div className="text-xs text-ink/60 truncate">{project}</div>
      </div>
      <div className="text-xs text-ink/50 whitespace-nowrap">{when}</div>
    </li>
  );
}

function ConnectionsGraph() {
  const cx = 130;
  const cy = 90;
  const nodes = [
    { x: 40, y: 30, c: "#1f6b3b" },
    { x: 220, y: 30, c: "#2842a4" },
    { x: 30, y: 150, c: "#5435a4" },
    { x: 230, y: 150, c: "#a4283c" },
    { x: 90, y: 15, c: "#c99a20" },
    { x: 180, y: 165, c: "#8a6713" },
    { x: 20, y: 90, c: "#2842a4" },
    { x: 250, y: 90, c: "#1f6b3b" },
  ];
  return (
    <svg viewBox="0 0 260 180" className="w-full h-40">
      {nodes.map((n, i) => (
        <line key={i} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#e5e7eb" strokeWidth="1" />
      ))}
      <circle cx={cx} cy={cy} r="22" fill="#efe9fb" stroke="#5435a4" strokeWidth="1.5" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#5435a4" fontWeight="600">MEMORY</text>
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="6" fill={n.c} />
      ))}
    </svg>
  );
}
