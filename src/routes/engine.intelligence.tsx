import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { Database, Link2, Lightbulb, Calendar, Clock, Gauge, Download, Upload, GitMerge, Sparkles, MoreHorizontal, X } from "lucide-react";

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

const ITEMS: Item[] = [
  { id: "i1", title: "Launch date is January 1, 2026", summary: "Official target for school platform launch.", type: "Client Truth", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:14 AM", confidence: 95, tags: ["Launch", "Deadline"], usedIn: "Roadmap v1.2 · 3 milestones" },
  { id: "i2", title: "80 students expected in Phase 1", summary: "Initial schools launch with ~80 students.", type: "Client Truth", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:15 AM", confidence: 92, tags: ["Students", "Phase 1"], usedIn: "Q-Bank Engine Pre-Test MVP" },
  { id: "i3", title: "Q-Bank is the foundation", summary: "Q-Bank drives everything. Get this right first.", type: "Decision", project: "Mental Dental Academy", source: "Launch Notes v2", sourceDate: "Jun 18, 2025", captured: "Jun 18, 2025 · 3:22 PM", confidence: 93, tags: ["Q-Bank", "Core"], usedIn: "Milestone Ordering · Priorities" },
  { id: "i4", title: "Pre-Test before content access", summary: "Students complete pre-test before modules.", type: "Requirement", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:16 AM", confidence: 90, tags: ["Pre-Test", "Access"], usedIn: "Pre-Test MVP · Student Flow" },
  { id: "i5", title: "Schools want simple reporting", summary: "Need easy reports for school admins.", type: "Opportunity", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:17 AM", confidence: 78, tags: ["Reporting", "Admin"], usedIn: "School Portal · Analytics" },
  { id: "i6", title: "Budget range $100k – $150k", summary: "Annual investment range discussed.", type: "Constraint", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:18 AM", confidence: 88, tags: ["Budget", "Investment"], usedIn: "Investment Builder · Client Preview" },
  { id: "i7", title: "Q-Bank import from existing bank", summary: "Need ability to import existing questions.", type: "Requirement", project: "Mental Dental Academy", source: "Launch Notes v2", sourceDate: "Jun 18, 2025", captured: "Jun 18, 2025 · 3:25 PM", confidence: 75, tags: ["Q-Bank", "Import"], usedIn: "Q-Bank Engine · Admin Tools" },
  { id: "i8", title: "Parents will not use the platform", summary: "Platform is for students and schools only.", type: "Client Truth", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:18 AM", confidence: 91, tags: ["Users", "Access"], usedIn: "Feature Scope · User Roles" },
  { id: "i9", title: "Compliance and data privacy critical", summary: "Must meet school data requirements.", type: "Risk", project: "Mental Dental Academy", source: "Launch Notes v2", sourceDate: "Jun 18, 2025", captured: "Jun 18, 2025 · 3:27 PM", confidence: 89, tags: ["Compliance", "Security"], usedIn: "System Blueprint · Risk Register" },
  { id: "i10", title: "Mobile experience must be strong", summary: "Students will access mostly on mobile.", type: "Preference", project: "Mental Dental Academy", source: "Ryan Discovery Call", sourceDate: "Jun 19, 2025", captured: "Jun 19, 2025 · 10:19 AM", confidence: 70, tags: ["Mobile", "UX"], usedIn: "Design System · All Milestones" },
  { id: "i11", title: "Launch target: Jan 1, 2026", summary: "Client confirmed the launch date is January 1st, 2026.", type: "Client Truth", project: "Mental Dental Academy", source: "Launch Notes v2", sourceDate: "Jun 18, 2025", captured: "Jun 18, 2025 · 3:14 PM", confidence: 88, tags: ["Launch", "Deadline"], usedIn: "Roadmap v1.2" },
  { id: "i12", title: "Roughly 80 students in first cohort", summary: "First cohort will be about 80 students.", type: "Client Truth", project: "Mental Dental Academy", source: "Launch Notes v2", sourceDate: "Jun 18, 2025", captured: "Jun 18, 2025 · 3:16 PM", confidence: 84, tags: ["Students", "Phase 1"], usedIn: "Pre-Test MVP" },
  { id: "i13", title: "Low-confidence: possibly needs SSO", summary: "One passing mention of maybe wanting SSO.", type: "Requirement", project: "Mental Dental Academy", source: "Slack thread", sourceDate: "May 12, 2025", captured: "May 12, 2025 · 4:02 PM", confidence: 42, tags: ["SSO"], usedIn: "—" },
  { id: "i14", title: "Old constraint: prior budget cap $80k", summary: "Superseded by updated $100–150k range.", type: "Constraint", project: "Mental Dental Academy", source: "Kickoff notes", sourceDate: "Mar 1, 2025", captured: "Mar 1, 2025 · 9:00 AM", confidence: 55, tags: ["Budget"], usedIn: "—" },
];

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

function IntelligenceMemoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("All Memory");
  const [items, setItems] = useState<Item[]>(ITEMS);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const rows = tab === "All Memory" || tab === "Insights" ? items : items.filter((i) => i.type === tab);

  return (
    <div className="max-w-[1500px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Memory</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Intelligence Memory</h1>
      <p className="text-ink/60 mb-6">The living memory of all project intelligence. Organized, connected, and always ready to inform better decisions.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Total Items" value="2,487" tone="purple" hint={<span className="flex items-center gap-1"><Database className="w-3 h-3" />Across all projects</span>} />
        <MetricCard label="Sources Connected" value={68} tone="blue" hint={<span className="flex items-center gap-1"><Link2 className="w-3 h-3" />Active sources</span>} />
        <MetricCard label="Insights Extracted" value="1,142" tone="orange" hint={<span className="flex items-center gap-1"><Lightbulb className="w-3 h-3" />This month</span>} />
        <MetricCard label="First Captured" value="Jan 3" tone="default" hint={<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />2025</span>} />
        <MetricCard label="Last Updated" value="Jun 20" tone="default" hint={<span className="flex items-center gap-1"><Clock className="w-3 h-3" />9:24 AM</span>} />
        <MetricCard label="Avg Confidence" value="87%" tone="green" hint={<span className="flex items-center gap-1"><Gauge className="w-3 h-3" />Across all items</span>} />
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
                {rows.map((it) => {
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
                      <td className="px-3 py-3 text-ink/80 whitespace-nowrap">{it.project}</td>
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
                        <button className="p-1 rounded hover:bg-paper-soft text-ink/60"><MoreHorizontal className="w-4 h-4" /></button>
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
              <LegendRow color="#1f6b3b" label="Client Truths" value={425} />
              <LegendRow color="#2842a4" label="Decisions" value={312} />
              <LegendRow color="#5435a4" label="Requirements" value={518} />
              <LegendRow color="#a4283c" label="Constraints" value={284} />
              <LegendRow color="#c99a20" label="Opportunities" value={401} />
              <LegendRow color="#8a6713" label="Risks" value={204} />
            </ul>
          </SectionCard>

          <SectionCard title="Recent Additions">
            <ul className="space-y-3 text-sm">
              <RecentItem title="New discovery call transcript" project="Mental Dental Academy" when="10:14 AM" />
              <RecentItem title="Launch notes v2 uploaded" project="Mental Dental Academy" when="9:32 AM" />
              <RecentItem title="School ops feedback" project="Mental Dental Academy" when="Yesterday" />
              <RecentItem title="Q-Bank export data" project="Mental Dental Academy" when="Yesterday" />
            </ul>
          </SectionCard>

          <SectionCard title="Most Connected Insights">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between text-ink"><span>Q-Bank is the foundation</span><span className="text-xs text-ink/60">18</span></li>
              <li className="flex justify-between text-ink"><span>Launch date Jan 1, 2026</span><span className="text-xs text-ink/60">14</span></li>
              <li className="flex justify-between text-ink"><span>Pre-Test before content access</span><span className="text-xs text-ink/60">12</span></li>
              <li className="flex justify-between text-ink"><span>Budget range $100k–$150k</span><span className="text-xs text-ink/60">11</span></li>
              <li className="flex justify-between text-ink"><span>80 students in Phase 1</span><span className="text-xs text-ink/60">10</span></li>
            </ul>
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickBtn icon={<Upload className="w-3.5 h-3.5" />} label="Import Source" />
              <QuickBtn icon={<Download className="w-3.5 h-3.5" />} label="Export Memory" />
              <QuickBtn icon={<GitMerge className="w-3.5 h-3.5" />} label="Merge Duplicates" onClick={() => setMergeOpen(true)} />
              <QuickBtn icon={<Sparkles className="w-3.5 h-3.5" />} label="Clean & Optimize" onClick={() => setCleanOpen(true)} />
            </div>
          </SectionCard>
        </div>
      </div>

      {mergeOpen ? (
        <MergeDuplicatesDialog
          items={items}
          onClose={() => setMergeOpen(false)}
          onApply={(nextItems) => {
            setItems(nextItems);
            setMergeOpen(false);
          }}
        />
      ) : null}
      {cleanOpen ? (
        <CleanOptimizeDialog
          items={items}
          onClose={() => setCleanOpen(false)}
          onApply={(nextItems) => {
            setItems(nextItems);
            setCleanOpen(false);
          }}
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

function MergeDuplicatesDialog({ items, onClose, onApply }: { items: Item[]; onClose: () => void; onApply: (next: Item[]) => void }) {
  const clusters = useMemo(() => findDuplicateClusters(items), [items]);
  const [selected, setSelected] = useState<Set<string>>(new Set(clusters.map((c) => c.key)));

  const apply = () => {
    const toRemove = new Set<string>();
    const toAdd: Item[] = [];
    for (const c of clusters) {
      if (!selected.has(c.key)) continue;
      c.items.forEach((it) => toRemove.add(it.id));
      toAdd.push(mergeCluster(c.items));
    }
    const next = items.filter((it) => !toRemove.has(it.id)).concat(toAdd);
    onApply(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">Merge Duplicates</div>
            <div className="text-xs text-ink/60">Grouped by shared tags and title similarity. Review each merge before applying.</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {clusters.length === 0 ? (
            <div className="text-center py-10 text-ink/50 text-sm">No duplicate clusters detected.</div>
          ) : (
            clusters.map((c) => {
              const merged = mergeCluster(c.items);
              const isSel = selected.has(c.key);
              return (
                <div key={c.key} className={cn("border rounded-lg overflow-hidden", isSel ? "border-royal" : "border-border")}>
                  <label className="flex items-center gap-2 p-3 bg-paper-soft border-b border-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(c.key); else next.delete(c.key);
                        setSelected(next);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{c.items.length} similar items in {c.items[0].project}</div>
                      <div className="text-xs text-ink/60">Similarity ~{Math.round(c.similarity * 100)}%</div>
                    </div>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div className="p-3 border-r border-border">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#a4283c] mb-2">Before ({c.items.length})</div>
                      <ul className="space-y-2">
                        {c.items.map((it) => (
                          <li key={it.id} className="text-xs border border-border rounded p-2 bg-white">
                            <div className="font-medium text-ink">{it.title}</div>
                            <div className="text-ink/60">{it.summary}</div>
                            <div className="text-ink/50 mt-1">Confidence {it.confidence}% · {it.tags.join(", ")}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3 bg-[#f5fbf7]">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#1f6b3b] mb-2">After (1 merged)</div>
                      <div className="text-xs border border-[#c4e6d2] rounded p-2 bg-white">
                        <div className="font-medium text-ink">{merged.title}</div>
                        <div className="text-ink/60">{merged.summary}</div>
                        <div className="text-ink/50 mt-1">Confidence {merged.confidence}% · {merged.tags.join(", ")}</div>
                      </div>
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
              disabled={selected.size === 0}
              className="text-xs px-3 py-1.5 rounded bg-royal text-white hover:bg-royal/90 disabled:opacity-40"
            >
              Apply {selected.size} merge{selected.size === 1 ? "" : "s"}
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

function CleanOptimizeDialog({ items, onClose, onApply }: { items: Item[]; onClose: () => void; onApply: (next: Item[]) => void }) {
  const actions = useMemo(() => detectCleanActions(items), [items]);
  const [selected, setSelected] = useState<Set<string>>(new Set(actions.map((a) => a.item.id)));

  const apply = () => {
    onApply(items.filter((it) => !selected.has(it.id)));
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
            <ul className="space-y-2">
              {actions.map((a) => {
                const isSel = selected.has(a.item.id);
                return (
                  <li key={a.item.id} className={cn("border rounded-lg p-3", isSel ? "border-[#a4283c] bg-[#fbe9ec]/40" : "border-border")}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(a.item.id); else next.delete(a.item.id);
                          setSelected(next);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono uppercase tracking-wider text-[#a4283c]">Remove</span>
                          <span className="text-[10px] bg-[#fbe9ec] border border-[#f3ced5] rounded px-1.5 py-0.5 text-[#a4283c]">{a.reason}</span>
                        </div>
                        <div className="text-sm font-medium text-ink mt-1 line-through opacity-60">{a.item.title}</div>
                        <div className="text-xs text-ink/60 line-through opacity-60">{a.item.summary}</div>
                        <div className="text-[10px] text-ink/50 mt-1">{a.item.project} · {a.item.type} · Confidence {a.item.confidence}%</div>
                      </div>
                    </label>
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
              disabled={selected.size === 0}
              className="text-xs px-3 py-1.5 rounded bg-[#a4283c] text-white hover:bg-[#8a2033] disabled:opacity-40"
            >
              Remove {selected.size} item{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </footer>
      </div>
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
