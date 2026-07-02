import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { Send, Eye, MessageCircle, CheckCircle2, Archive, Calendar, AlertCircle, PlusCircle, X, ArrowRight, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/engine/delivery")({
  component: DeliveryRoomPage,
});

// ─────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────
type DStatus =
  | "ready"
  | "scheduled"
  | "sent"
  | "viewed"
  | "responded"
  | "follow_up"
  | "accepted"
  | "execution"
  | "archived";

const STATUS_META: Record<DStatus, { label: string; cls: string }> = {
  ready: { label: "Ready to Send", cls: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]" },
  scheduled: { label: "Presentation Scheduled", cls: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]" },
  sent: { label: "Sent", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  viewed: { label: "Viewed", cls: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]" },
  responded: { label: "Client Responded", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  follow_up: { label: "Follow-up Needed", cls: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]" },
  accepted: { label: "Accepted", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  execution: { label: "Moved to Execution", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  archived: { label: "Archived", cls: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]" },
};

type Transition = { to: DStatus; label: string; icon: React.ReactNode };

const TRANSITIONS: Record<DStatus, Transition[]> = {
  ready: [
    { to: "scheduled", label: "Schedule Presentation", icon: <Calendar className="w-3 h-3" /> },
    { to: "sent", label: "Send Now", icon: <Send className="w-3 h-3" /> },
    { to: "archived", label: "Archive", icon: <Archive className="w-3 h-3" /> },
  ],
  scheduled: [
    { to: "sent", label: "Mark Sent", icon: <Send className="w-3 h-3" /> },
    { to: "ready", label: "Unschedule", icon: <ArrowRight className="w-3 h-3" /> },
  ],
  sent: [
    { to: "viewed", label: "Mark Viewed", icon: <Eye className="w-3 h-3" /> },
    { to: "follow_up", label: "Needs Follow-up", icon: <MessageCircle className="w-3 h-3" /> },
  ],
  viewed: [
    { to: "responded", label: "Log Response", icon: <MessageCircle className="w-3 h-3" /> },
    { to: "follow_up", label: "Needs Follow-up", icon: <MessageCircle className="w-3 h-3" /> },
    { to: "accepted", label: "Accept", icon: <CheckCircle2 className="w-3 h-3" /> },
  ],
  responded: [
    { to: "follow_up", label: "Needs Follow-up", icon: <MessageCircle className="w-3 h-3" /> },
    { to: "accepted", label: "Accept", icon: <CheckCircle2 className="w-3 h-3" /> },
  ],
  follow_up: [
    { to: "responded", label: "Client Responded", icon: <MessageCircle className="w-3 h-3" /> },
    { to: "accepted", label: "Accept", icon: <CheckCircle2 className="w-3 h-3" /> },
    { to: "archived", label: "Archive", icon: <Archive className="w-3 h-3" /> },
  ],
  accepted: [
    { to: "execution", label: "Move to Execution", icon: <PlayCircle className="w-3 h-3" /> },
    { to: "archived", label: "Archive", icon: <Archive className="w-3 h-3" /> },
  ],
  execution: [
    { to: "archived", label: "Archive", icon: <Archive className="w-3 h-3" /> },
  ],
  archived: [
    { to: "ready", label: "Restore to Ready", icon: <ArrowRight className="w-3 h-3" /> },
  ],
};

type Delivery = {
  id: string;
  client: string;
  roadmap: string;
  version: string;
  status: DStatus;
  channel: string;
  recipient: string;
  recipientRole: string;
  preparedBy: string;
  approvedBy: string;
  lastAction: string;
  history: Array<{ at: string; from: DStatus | "created"; to: DStatus; note?: string }>;
};

const INITIAL: Delivery[] = [
  { id: "d1", client: "Mental Dental Academy", roadmap: "Scale Dental Board Prep", version: "v1.0", status: "ready", channel: "Email + Portal", recipient: "Ryan Driscoll", recipientRole: "Founder & CEO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Approved today, 9:41 AM", history: [] },
  { id: "d2", client: "Gradient Group", roadmap: "Job Board Growth Engine", version: "v2.1", status: "scheduled", channel: "Live Presentation", recipient: "Love Malone", recipientRole: "COO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Scheduled tomorrow, 10:00 AM", history: [] },
  { id: "d3", client: "SBREADS", roadmap: "Digital Platform Upgrade", version: "v1.3", status: "sent", channel: "Email", recipient: "Andrew M.", recipientRole: "Executive Director", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Sent Jun 10, 2025", history: [] },
  { id: "d4", client: "Temple Emanu-El", roadmap: "Event & Community Hub", version: "v1.0", status: "viewed", channel: "Client Portal", recipient: "Kim Cohen", recipientRole: "Ops Director", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Viewed Jun 11, 2025", history: [] },
  { id: "d5", client: "SpaExecutive", roadmap: "Magazine Platform", version: "v1.2", status: "follow_up", channel: "Email", recipient: "Elizabeth H.", recipientRole: "Publisher", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Opened Jun 10, 2025", history: [] },
  { id: "d6", client: "Thriving Minds AZ", roadmap: "LMS & Community Build", version: "v1.0", status: "follow_up", channel: "Live Presentation", recipient: "Dr. Sarah T.", recipientRole: "Founder", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "No response 5 days", history: [] },
  { id: "d7", client: "Valley Precision Painting", roadmap: "Operations & Lead Engine", version: "v1.0", status: "execution", channel: "Client Portal", recipient: "Jason V.", recipientRole: "Owner", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Moved to Execution Jun 6", history: [] },
  { id: "d8", client: "Innago", roadmap: "Platform Modernization", version: "v1.1", status: "archived", channel: "Client Portal", recipient: "Derrick I.", recipientRole: "CTO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Archived May 30, 2025", history: [] },
];

const TAB_KEYS: (DStatus | "all")[] = ["all", "ready", "scheduled", "sent", "viewed", "responded", "follow_up", "accepted", "execution", "archived"];
const TAB_LABELS: Record<DStatus | "all", string> = {
  all: "All",
  ready: "Ready",
  scheduled: "Scheduled",
  sent: "Sent",
  viewed: "Viewed",
  responded: "Responded",
  follow_up: "Follow-up",
  accepted: "Accepted",
  execution: "Execution",
  archived: "Archived",
};

function DeliveryRoomPage() {
  const [tab, setTab] = useState<DStatus | "all">("all");
  const [items, setItems] = useState<Delivery[]>(INITIAL);
  const [historyOpen, setHistoryOpen] = useState<Delivery | null>(null);

  const rows = tab === "all" ? items : items.filter((d) => d.status === tab);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const d of items) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [items]);

  function transition(id: string, to: DStatus, note?: string) {
    setItems((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const now = new Date();
        const stamp = now.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return {
          ...d,
          status: to,
          lastAction: `${STATUS_META[to].label} · ${stamp}`,
          history: [...d.history, { at: now.toISOString(), from: d.status, to, note }],
        };
      }),
    );
  }

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Handoff</div>
          <h1 className="font-display text-4xl text-ink mt-1">Delivery Room</h1>
          <p className="text-ink/60 mt-1">Managed lifecycle: Ready → Scheduled → Sent → Viewed → Responded → Follow-up → Accepted → Execution → Archived.</p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-sm bg-ink text-white rounded-md px-3 py-2 hover:bg-ink/90">
          <PlusCircle className="w-4 h-4" /> New Delivery
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Ready to Send" value={counts.ready ?? 0} tone="purple" />
        <MetricCard label="Scheduled" value={counts.scheduled ?? 0} tone="blue" />
        <MetricCard label="Viewed" value={counts.viewed ?? 0} tone="blue" />
        <MetricCard label="Follow-up" value={counts.follow_up ?? 0} tone="orange" />
        <MetricCard label="Accepted" value={counts.accepted ?? 0} tone="green" />
        <MetricCard label="In Execution" value={counts.execution ?? 0} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <SectionCard
          title={
            <div className="flex items-center gap-1 flex-wrap">
              {TAB_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border",
                    tab === k ? "bg-ink text-white border-ink" : "border-transparent text-ink/70 hover:border-border",
                  )}
                >
                  {TAB_LABELS[k]} <span className="opacity-60">{counts[k] ?? 0}</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Roadmap</th>
                  <th className="px-3 py-2.5">Ver</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Recipient</th>
                  <th className="px-3 py-2.5">Last Action</th>
                  <th className="px-5 py-2.5 text-right">Next Steps</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 hover:bg-paper-soft/40 align-top">
                    <td className="px-5 py-3 font-medium text-ink whitespace-nowrap">{d.client}</td>
                    <td className="px-3 py-3">
                      <div className="text-ink">{d.roadmap}</div>
                      <div className="text-xs text-ink/60">{d.channel}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink/70">{d.version}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS_META[d.status].cls)}>
                        {STATUS_META[d.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-ink">{d.recipient}</div>
                      <div className="text-xs text-ink/60">{d.recipientRole}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink/70 whitespace-nowrap">{d.lastAction}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        {TRANSITIONS[d.status].map((t) => (
                          <button
                            key={t.to}
                            onClick={() => transition(d.id, t.to)}
                            className="inline-flex items-center gap-1 text-[11px] border border-border rounded px-2 py-1 hover:border-royal/50 hover:bg-paper-soft text-ink"
                          >
                            {t.icon}
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setHistoryOpen(d)}
                          className="inline-flex items-center gap-1 text-[11px] text-ink/60 hover:text-ink px-2 py-1"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Delivery Lifecycle">
            <ol className="space-y-1.5 text-xs text-ink/70">
              {(["ready", "scheduled", "sent", "viewed", "responded", "follow_up", "accepted", "execution", "archived"] as DStatus[]).map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="font-mono text-ink/40 w-4">{i + 1}</span>
                  <span className={cn("inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border", STATUS_META[s].cls)}>
                    {STATUS_META[s].label}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Needs Follow-up">
            <ul className="space-y-2 text-sm">
              {items.filter((d) => d.status === "follow_up").map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-[#8a6713] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink font-medium truncate">{d.client}</div>
                    <div className="text-xs text-ink/60">{d.lastAction}</div>
                  </div>
                  <button
                    onClick={() => transition(d.id, "responded")}
                    className="text-[11px] text-royal hover:underline"
                  >
                    Log reply
                  </button>
                </li>
              ))}
              {items.filter((d) => d.status === "follow_up").length === 0 ? (
                <li className="text-xs text-ink/50">Nothing waiting.</li>
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>

      {historyOpen ? (
        <HistoryDialog delivery={historyOpen} onClose={() => setHistoryOpen(null)} />
      ) : null}
    </div>
  );
}

function HistoryDialog({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">{delivery.client}</div>
            <div className="text-xs text-ink/60">{delivery.roadmap} · {delivery.version}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 mb-2">Status History</div>
          {delivery.history.length === 0 ? (
            <div className="text-sm text-ink/60">No transitions logged yet in this session.</div>
          ) : (
            <ol className="space-y-2">
              {delivery.history.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="font-mono text-xs text-ink/40 w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-ink">
                      <span className="text-ink/60">{STATUS_META[h.from as DStatus]?.label ?? h.from}</span>
                      {" → "}
                      <span className="font-medium">{STATUS_META[h.to].label}</span>
                    </div>
                    <div className="text-xs text-ink/60">{new Date(h.at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
