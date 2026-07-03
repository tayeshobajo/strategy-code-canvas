import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Menu,
  X,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  GitBranch,
  Package,
  User,
  Users,
  ArrowRight,
  Mountain,
  Sparkles,
  Filter,
} from "lucide-react";

export const Route = createFileRoute("/portal/roadmap-mockup")({
  component: RoadmapMockupPage,
  head: () => ({
    meta: [
      { title: "Roadmap Mockup — Trust Tai" },
      { name: "description", content: "Interactive client roadmap: Foundation, Core Platform, Scale Systems." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

// ---------- Data model ----------

type Owner = "CLIENT" | "TRUST TAI";
type Status = "completed" | "in_progress" | "upcoming";
type Kind = "milestone" | "decision" | "deliverable";

type Milestone = {
  id: string;
  title: string;
  summary: string;
  kind: Kind;
  status: Status;
  owner: Owner;
  date: string; // ISO
  // relative position along the phase (0..1) for painting
  x: number;
  y: number; // 0 top .. 1 bottom
  updates?: { at: string; text: string }[];
};

type Phase = {
  key: "foundation" | "core" | "scale";
  label: string;
  index: number;
  peakColor: string;
  accent: string;
  blurb: string;
  milestones: Milestone[];
};

const PHASES: Phase[] = [
  {
    key: "foundation",
    label: "Foundation",
    index: 1,
    peakColor: "#1B2A45",
    accent: "#3B82F6",
    blurb: "Discovery, alignment, and the ground truth Tai builds on.",
    milestones: [
      {
        id: "f1",
        title: "Kickoff & Charter",
        summary: "Working agreement, decision cadence, and success metrics signed off.",
        kind: "milestone",
        status: "completed",
        owner: "TRUST TAI",
        date: "2026-05-14",
        x: 0.15,
        y: 0.55,
        updates: [{ at: "May 15", text: "Charter countersigned by both principals." }],
      },
      {
        id: "f2",
        title: "Stakeholder Interviews",
        summary: "8 interviews across ops, revenue, and product leadership.",
        kind: "deliverable",
        status: "completed",
        owner: "TRUST TAI",
        date: "2026-05-28",
        x: 0.38,
        y: 0.35,
      },
      {
        id: "f3",
        title: "Approve Operating Model",
        summary: "Client sign-off on the operating model before build begins.",
        kind: "decision",
        status: "in_progress",
        owner: "CLIENT",
        date: "2026-07-08",
        x: 0.62,
        y: 0.22,
        updates: [{ at: "Jul 2", text: "Draft circulated; response requested by Jul 8." }],
      },
      {
        id: "f4",
        title: "Foundation Readout",
        summary: "Findings, risks, and the phase-two brief.",
        kind: "milestone",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2026-07-22",
        x: 0.86,
        y: 0.4,
      },
    ],
  },
  {
    key: "core",
    label: "Core Platform",
    index: 2,
    peakColor: "#122036",
    accent: "#8B5CF6",
    blurb: "The systems, data, and rituals that make everything else compounding.",
    milestones: [
      {
        id: "c1",
        title: "Data Spine Live",
        summary: "Warehouse, identity graph, and event stream wired end-to-end.",
        kind: "deliverable",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2026-08-19",
        x: 0.2,
        y: 0.5,
      },
      {
        id: "c2",
        title: "Approve Vendor Shortlist",
        summary: "Choose the two long-term platforms Tai will integrate against.",
        kind: "decision",
        status: "upcoming",
        owner: "CLIENT",
        date: "2026-09-02",
        x: 0.44,
        y: 0.28,
      },
      {
        id: "c3",
        title: "Ops Rituals Rollout",
        summary: "Weekly cadence, decision log, and quarterly review cadence go live.",
        kind: "milestone",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2026-09-30",
        x: 0.68,
        y: 0.18,
      },
      {
        id: "c4",
        title: "Core Platform GA",
        summary: "Systems handed off to internal owners with a 30-day support tail.",
        kind: "milestone",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2026-10-21",
        x: 0.9,
        y: 0.38,
      },
    ],
  },
  {
    key: "scale",
    label: "Scale Systems",
    index: 3,
    peakColor: "#0C1830",
    accent: "#F97316",
    blurb: "Compounding motion: measurement, expansion, and defensibility.",
    milestones: [
      {
        id: "s1",
        title: "Growth Loops Instrumented",
        summary: "Two acquisition and one retention loop measured with counterfactuals.",
        kind: "deliverable",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2026-11-18",
        x: 0.22,
        y: 0.48,
      },
      {
        id: "s2",
        title: "Approve Expansion Wedge",
        summary: "Pick the adjacent market or product to press first.",
        kind: "decision",
        status: "upcoming",
        owner: "CLIENT",
        date: "2026-12-09",
        x: 0.5,
        y: 0.24,
      },
      {
        id: "s3",
        title: "Executive Dashboard",
        summary: "Board-grade view of leading indicators and capital efficiency.",
        kind: "deliverable",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2027-01-13",
        x: 0.74,
        y: 0.32,
      },
      {
        id: "s4",
        title: "Engagement Close-out",
        summary: "Compound-interest review, handover binder, and next-year plan.",
        kind: "milestone",
        status: "upcoming",
        owner: "TRUST TAI",
        date: "2027-02-24",
        x: 0.94,
        y: 0.42,
      },
    ],
  },
];

// ---------- Tokens & helpers ----------

const NAVY = "#0A1220";
const NAVY_2 = "#0F1A2E";
const NAVY_3 = "#152444";
const GOLD = "#C8A97E";
const GOLD_SOFT = "#E4CFA6";
const INK = "#E7ECF5";
const MUTED = "#8B97AE";

const KIND_COLOR: Record<Kind, string> = {
  milestone: "#3B82F6",
  decision: "#A78BFA",
  deliverable: "#F97316",
};

const KIND_LABEL: Record<Kind, string> = {
  milestone: "Milestone",
  decision: "Decision",
  deliverable: "Deliverable",
};

const KIND_ICON: Record<Kind, typeof Flag> = {
  milestone: Flag,
  decision: GitBranch,
  deliverable: Package,
};

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const then = new Date(iso + "T00:00:00");
  return Math.round((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------- Page ----------

function RoadmapMockupPage() {
  const [activePhaseKey, setActivePhaseKey] = useState<Phase["key"]>("foundation");
  const [selectedId, setSelectedId] = useState<string>("f3");
  const [ownerFilter, setOwnerFilter] = useState<"ALL" | Owner>("ALL");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activePhase = PHASES.find((p) => p.key === activePhaseKey)!;
  const allMilestones = useMemo(() => PHASES.flatMap((p) => p.milestones.map((m) => ({ ...m, phaseKey: p.key }))), []);
  const selected = allMilestones.find((m) => m.id === selectedId) ?? allMilestones[0];

  const visibleMilestones = useMemo(
    () => activePhase.milestones.filter((m) => ownerFilter === "ALL" || m.owner === ownerFilter),
    [activePhase, ownerFilter]
  );

  const nextAction = useMemo(
    () =>
      allMilestones
        .filter((m) => m.status !== "completed" && m.owner === "CLIENT")
        .sort((a, b) => a.date.localeCompare(b.date))[0],
    [allMilestones]
  );

  const currentPhase = useMemo(
    () =>
      PHASES.find((p) => p.milestones.some((m) => m.status === "in_progress")) ??
      PHASES.find((p) => p.milestones.some((m) => m.status === "upcoming")) ??
      PHASES[0],
    []
  );

  const currentMilestone = useMemo(
    () =>
      allMilestones.find((m) => m.status === "in_progress") ??
      allMilestones.find((m) => m.status === "upcoming"),
    [allMilestones]
  );

  const keyDates = useMemo(
    () =>
      allMilestones
        .filter((m) => m.status !== "completed")
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [allMilestones]
  );

  function handleSelectMilestone(m: Milestone & { phaseKey?: string }) {
    setSelectedId(m.id);
    const phase = PHASES.find((p) => p.milestones.some((x) => x.id === m.id));
    if (phase) setActivePhaseKey(phase.key);
  }

  return (
    <div
      className="min-h-screen text-[color:var(--ink)] font-sans"
      style={
        {
          background: `radial-gradient(120% 80% at 50% -10%, ${NAVY_3} 0%, ${NAVY} 55%, ${NAVY} 100%)`,
          ["--ink" as string]: INK,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{ borderColor: "rgba(200,169,126,0.15)", background: "rgba(10,18,32,0.75)" }}
      >
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)` }}
              >
                <Mountain className="h-4 w-4" style={{ color: NAVY }} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                  Trust Tai
                </div>
                <div className="truncate text-sm font-medium" style={{ color: INK }}>
                  Client Roadmap
                </div>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Portal sections">
              {["Roadmap", "Documents", "Messages", "Billing"].map((label, i) => (
                <a
                  key={label}
                  href="#"
                  className="px-3 py-2 rounded-md transition-colors"
                  style={{
                    color: i === 0 ? INK : MUTED,
                    background: i === 0 ? "rgba(200,169,126,0.08)" : "transparent",
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                style={{ borderColor: "rgba(200,169,126,0.25)", color: GOLD_SOFT }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
                Live engagement
              </div>
              <button
                className="md:hidden grid h-9 w-9 place-items-center rounded-md border"
                style={{ borderColor: "rgba(200,169,126,0.25)", color: INK }}
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <div
            className="absolute right-0 top-0 h-full w-72 p-5 shadow-2xl"
            style={{ background: NAVY_2, borderLeft: `1px solid rgba(200,169,126,0.2)` }}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-[11px] uppercase tracking-[0.22em]" style={{ color: GOLD }}>Menu</span>
              <button onClick={() => setMobileNavOpen(false)} aria-label="Close">
                <X className="h-5 w-5" style={{ color: INK }} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {["Roadmap", "Documents", "Messages", "Billing"].map((l) => (
                <a key={l} href="#" className="px-3 py-2.5 rounded-md text-sm"
                   style={{ color: INK, background: l === "Roadmap" ? "rgba(200,169,126,0.1)" : "transparent" }}>
                  {l}
                </a>
              ))}
            </nav>
            <div className="mt-8 pt-6 border-t" style={{ borderColor: "rgba(200,169,126,0.15)" }}>
              <SidebarInner
                nextAction={nextAction}
                currentPhase={currentPhase}
                currentMilestone={currentMilestone}
                keyDates={keyDates}
                ownerFilter={ownerFilter}
                setOwnerFilter={setOwnerFilter}
                onPick={(m) => {
                  handleSelectMilestone(m);
                  setMobileNavOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] gap-6 lg:gap-8">
          {/* Left sidebar */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-24 space-y-6">
              <SidebarInner
                nextAction={nextAction}
                currentPhase={currentPhase}
                currentMilestone={currentMilestone}
                keyDates={keyDates}
                ownerFilter={ownerFilter}
                setOwnerFilter={setOwnerFilter}
                onPick={handleSelectMilestone}
              />
            </div>
          </aside>

          {/* Center canvas */}
          <section className="min-w-0 space-y-6">
            <PhaseTabs
              phases={PHASES}
              activeKey={activePhaseKey}
              onChange={(k) => setActivePhaseKey(k)}
              currentKey={currentPhase.key}
            />

            <MountainCanvas
              phase={activePhase}
              milestones={visibleMilestones}
              selectedId={selectedId}
              onSelect={handleSelectMilestone}
            />

            <Legend />

            <MilestoneList
              milestones={visibleMilestones}
              selectedId={selectedId}
              onSelect={handleSelectMilestone}
            />
          </section>

          {/* Right detail panel */}
          <aside className="min-w-0">
            <div className="lg:sticky lg:top-24 space-y-6">
              <DetailPanel selected={selected} currentPhase={currentPhase} />
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 border-t" style={{ borderColor: "rgba(200,169,126,0.15)" }}>
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="text-xs" style={{ color: MUTED }}>
            © {new Date().getFullYear()} Trust Tai · Confidential client roadmap
          </div>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: MUTED }}>
            <a href="mailto:client@trust-tai.com" className="hover:text-white transition-colors">
              client@trust-tai.com
            </a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
            <a href="#" className="hover:text-white transition-colors">Book a call</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------- Left sidebar ----------

function SidebarInner({
  nextAction,
  currentPhase,
  currentMilestone,
  keyDates,
  ownerFilter,
  setOwnerFilter,
  onPick,
}: {
  nextAction?: Milestone;
  currentPhase: Phase;
  currentMilestone?: Milestone;
  keyDates: Milestone[];
  ownerFilter: "ALL" | Owner;
  setOwnerFilter: (o: "ALL" | Owner) => void;
  onPick: (m: Milestone) => void;
}) {
  return (
    <>
      {/* Status */}
      <Panel>
        <Eyebrow>Status</Eyebrow>
        <div className="mt-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: GOLD }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: GOLD }} />
          </span>
          <span className="text-sm font-medium" style={{ color: INK }}>On track</span>
        </div>
        <div className="mt-2 text-xs" style={{ color: MUTED }}>
          Phase {currentPhase.index} · {currentPhase.label}
        </div>
        {currentMilestone && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgba(200,169,126,0.12)" }}>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
              Current milestone
            </div>
            <div className="mt-1 text-sm" style={{ color: INK }}>{currentMilestone.title}</div>
          </div>
        )}
      </Panel>

      {/* Next action */}
      {nextAction && (
        <Panel accent>
          <Eyebrow tone="gold">Next action</Eyebrow>
          <button
            onClick={() => onPick(nextAction)}
            className="mt-3 w-full text-left group"
          >
            <div className="text-sm font-medium" style={{ color: INK }}>{nextAction.title}</div>
            <div className="mt-1 text-xs" style={{ color: MUTED }}>{nextAction.summary}</div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5" style={{ color: GOLD_SOFT }}>
                <Clock className="h-3.5 w-3.5" />
                Due {fmtDate(nextAction.date)}
              </span>
              <span className="inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5" style={{ color: GOLD }}>
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
        </Panel>
      )}

      {/* Key dates */}
      <Panel>
        <Eyebrow>Key dates</Eyebrow>
        <ul className="mt-3 space-y-3">
          {keyDates.map((m) => {
            const days = daysUntil(m.date);
            return (
              <li key={m.id}>
                <button
                  onClick={() => onPick(m)}
                  className="w-full flex items-start justify-between gap-3 text-left group"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm" style={{ color: INK }}>{m.title}</div>
                    <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>{fmtDate(m.date)}</div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: days <= 14 ? "rgba(200,169,126,0.15)" : "rgba(139,151,174,0.12)",
                      color: days <= 14 ? GOLD : MUTED,
                    }}
                  >
                    {days <= 0 ? "Now" : `${days}d`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Responsibilities filter */}
      <Panel>
        <Eyebrow>Responsibilities</Eyebrow>
        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-md p-1" style={{ background: "rgba(255,255,255,0.03)" }}>
          {(["ALL", "CLIENT", "TRUST TAI"] as const).map((k) => {
            const active = ownerFilter === k;
            return (
              <button
                key={k}
                onClick={() => setOwnerFilter(k)}
                className="rounded px-2 py-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? GOLD : "transparent",
                  color: active ? NAVY : MUTED,
                }}
              >
                {k === "ALL" ? "All" : k === "CLIENT" ? "Client" : "Trust Tai"}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: MUTED }}>
          <Filter className="h-3 w-3" />
          Applied to canvas + list
        </div>
      </Panel>
    </>
  );
}

// ---------- Phase tabs ----------

function PhaseTabs({
  phases,
  activeKey,
  onChange,
  currentKey,
}: {
  phases: Phase[];
  activeKey: Phase["key"];
  onChange: (k: Phase["key"]) => void;
  currentKey: Phase["key"];
}) {
  return (
    <div className="rounded-xl border p-1.5" style={{ borderColor: "rgba(200,169,126,0.15)", background: "rgba(15,26,46,0.6)" }}>
      <div className="grid grid-cols-3 gap-1.5">
        {phases.map((p) => {
          const active = p.key === activeKey;
          const isCurrent = p.key === currentKey;
          return (
            <button
              key={p.key}
              onClick={() => onChange(p.key)}
              className="group relative rounded-lg px-4 py-3 text-left transition-all"
              style={{
                background: active ? "rgba(200,169,126,0.1)" : "transparent",
                boxShadow: active ? `inset 0 0 0 1px rgba(200,169,126,0.35)` : "none",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: active ? GOLD : MUTED }}>
                  Phase {p.index}
                </span>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: GOLD }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
                    Current
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm font-medium" style={{ color: INK }}>{p.label}</div>
              <div className="mt-0.5 hidden md:block text-[11px]" style={{ color: MUTED }}>
                {p.blurb}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Mountain canvas (SVG) ----------

function MountainCanvas({
  phase,
  milestones,
  selectedId,
  onSelect,
}: {
  phase: Phase;
  milestones: Milestone[];
  selectedId: string;
  onSelect: (m: Milestone) => void;
}) {
  const W = 1000;
  const H = 420;

  // Journey path
  const pathD = useMemo(() => {
    const y = (yn: number) => 60 + yn * (H - 140);
    const points = [
      [40, y(0.85)],
      [220, y(0.55)],
      [440, y(0.3)],
      [640, y(0.2)],
      [820, y(0.35)],
      [960, y(0.45)],
    ];
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [px, py] = points[i - 1];
      const [x, yy] = points[i];
      const cx = (px + x) / 2;
      d += ` Q ${cx} ${py}, ${cx} ${(py + yy) / 2} T ${x} ${yy}`;
    }
    return d;
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: "rgba(200,169,126,0.15)",
        background: `linear-gradient(180deg, ${NAVY_2} 0%, ${NAVY} 100%)`,
      }}
    >
      {/* Header row */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: GOLD }}>
            Phase {phase.index}
          </div>
          <div className="text-lg font-medium" style={{ color: INK }}>{phase.label}</div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px]" style={{ color: MUTED }}>
          <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
          Click a marker to open its detail
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-[380px] sm:h-[420px]" role="img" aria-label={`${phase.label} journey`}>
        <defs>
          <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={NAVY_3} stopOpacity="0.9" />
            <stop offset="100%" stopColor={NAVY} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="peak1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={phase.peakColor} stopOpacity="0.95" />
            <stop offset="100%" stopColor={NAVY} stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="peak2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E2E4F" stopOpacity="0.85" />
            <stop offset="100%" stopColor={NAVY} stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="pathGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.15" />
            <stop offset="50%" stopColor={GOLD} stopOpacity="0.65" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sky */}
        <rect width={W} height={H} fill="url(#sky)" />

        {/* Stars */}
        {Array.from({ length: 40 }).map((_, i) => {
          const x = (i * 137) % W;
          const y = (i * 53) % 180;
          const r = ((i * 7) % 3) * 0.4 + 0.4;
          return <circle key={i} cx={x} cy={y} r={r} fill={GOLD_SOFT} opacity={0.35} />;
        })}

        {/* Back ridge */}
        <path
          d={`M0 ${H} L 0 ${H - 120} L 120 ${H - 200} L 260 ${H - 150} L 420 ${H - 240} L 600 ${H - 170} L 780 ${H - 260} L 920 ${H - 200} L ${W} ${H - 150} L ${W} ${H} Z`}
          fill="url(#peak2)"
        />

        {/* Front ridge */}
        <path
          d={`M0 ${H} L 0 ${H - 60} L 140 ${H - 140} L 320 ${H - 90} L 500 ${H - 180} L 700 ${H - 110} L 880 ${H - 200} L ${W} ${H - 130} L ${W} ${H} Z`}
          fill="url(#peak1)"
        />

        {/* Journey path */}
        <path d={pathD} fill="none" stroke="url(#pathGrad)" strokeWidth={2.5} strokeDasharray="5 6" />

        {/* Point A / B labels */}
        <g>
          <circle cx={40} cy={60 + 0.85 * (H - 140)} r={5} fill={GOLD} />
          <text x={52} y={60 + 0.85 * (H - 140) + 4} fill={GOLD_SOFT} fontSize="11" fontFamily="ui-sans-serif">
            Point A · Start
          </text>
          <circle cx={960} cy={60 + 0.45 * (H - 140)} r={5} fill={GOLD} />
          <text x={890} y={60 + 0.45 * (H - 140) - 10} fill={GOLD_SOFT} fontSize="11" fontFamily="ui-sans-serif" textAnchor="start">
            Point B · Outcome
          </text>
        </g>
      </svg>

      {/* Marker layer (HTML overlay, positioned by % coords) */}
      <div className="absolute inset-0 pointer-events-none">
        {milestones.map((m) => (
          <Marker
            key={m.id}
            m={m}
            selected={m.id === selectedId}
            onClick={() => onSelect(m)}
          />
        ))}
      </div>
    </div>
  );
}

function Marker({ m, selected, onClick }: { m: Milestone; selected: boolean; onClick: () => void }) {
  const Icon = KIND_ICON[m.kind];
  const color = KIND_COLOR[m.kind];
  const StatusIcon =
    m.status === "completed" ? CheckCircle2 : m.status === "in_progress" ? Clock : Circle;

  return (
    <button
      onClick={onClick}
      className="group absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 focus:outline-none"
      style={{
        left: `${m.x * 100}%`,
        top: `${18 + m.y * 65}%`,
      }}
      aria-label={`${KIND_LABEL[m.kind]}: ${m.title}`}
    >
      {/* Halo */}
      <span
        className="absolute inset-0 -m-3 rounded-full blur-lg transition-opacity"
        style={{
          background: color,
          opacity: selected ? 0.45 : 0.0,
        }}
      />
      <span
        className="relative grid h-11 w-11 place-items-center rounded-full border-2 transition-all"
        style={{
          background: NAVY_2,
          borderColor: selected ? GOLD : color,
          boxShadow: selected
            ? `0 0 0 4px rgba(200,169,126,0.2), 0 10px 30px -8px ${color}`
            : `0 6px 18px -8px ${color}`,
          transform: selected ? "scale(1.08)" : "scale(1)",
        }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
        <span
          className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full"
          style={{ background: NAVY }}
        >
          <StatusIcon
            className="h-3 w-3"
            style={{
              color:
                m.status === "completed" ? "#4ADE80" : m.status === "in_progress" ? GOLD : MUTED,
            }}
          />
        </span>
      </span>

      {/* Label */}
      <span
        className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium transition-opacity"
        style={{
          background: "rgba(10,18,32,0.9)",
          color: selected ? GOLD : INK,
          border: `1px solid ${selected ? GOLD : "rgba(200,169,126,0.15)"}`,
          opacity: selected ? 1 : 0.85,
        }}
      >
        {m.title}
      </span>
    </button>
  );
}

// ---------- Legend ----------

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-xs" style={{ color: MUTED }}>
      {(Object.keys(KIND_COLOR) as Kind[]).map((k) => {
        const Icon = KIND_ICON[k];
        return (
          <div key={k} className="flex items-center gap-2">
            <span
              className="grid h-5 w-5 place-items-center rounded-full"
              style={{ background: `${KIND_COLOR[k]}22`, border: `1px solid ${KIND_COLOR[k]}66` }}
            >
              <Icon className="h-2.5 w-2.5" style={{ color: KIND_COLOR[k] }} />
            </span>
            {KIND_LABEL[k]}
          </div>
        );
      })}
      <div className="mx-2 hidden sm:block h-4 w-px" style={{ background: "rgba(200,169,126,0.15)" }} />
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#4ADE80" }} /> Completed
      </div>
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" style={{ color: GOLD }} /> In progress
      </div>
      <div className="flex items-center gap-2">
        <Circle className="h-3.5 w-3.5" style={{ color: MUTED }} /> Upcoming
      </div>
    </div>
  );
}

// ---------- Milestone list (below canvas) ----------

function MilestoneList({
  milestones,
  selectedId,
  onSelect,
}: {
  milestones: Milestone[];
  selectedId: string;
  onSelect: (m: Milestone) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "rgba(200,169,126,0.15)", color: MUTED }}>
        No items match this filter in the current phase.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {milestones.map((m) => {
        const Icon = KIND_ICON[m.kind];
        const color = KIND_COLOR[m.kind];
        const selected = m.id === selectedId;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className="text-left rounded-xl border p-4 transition-all hover:-translate-y-0.5"
            style={{
              borderColor: selected ? GOLD : "rgba(200,169,126,0.12)",
              background: selected ? "rgba(200,169,126,0.06)" : "rgba(15,26,46,0.5)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ background: `${color}22`, border: `1px solid ${color}55` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </span>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
                  {KIND_LABEL[m.kind]}
                </span>
              </div>
              <OwnerChip owner={m.owner} />
            </div>
            <div className="mt-3 text-sm font-medium" style={{ color: INK }}>{m.title}</div>
            <div className="mt-1 text-xs line-clamp-2" style={{ color: MUTED }}>{m.summary}</div>
            <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: MUTED }}>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {fmtDate(m.date)}
              </span>
              <StatusPill status={m.status} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Right detail panel ----------

function DetailPanel({ selected, currentPhase }: { selected: Milestone; currentPhase: Phase }) {
  const Icon = KIND_ICON[selected.kind];
  const color = KIND_COLOR[selected.kind];
  const days = daysUntil(selected.date);

  return (
    <>
      <Panel>
        <div className="flex items-center justify-between">
          <Eyebrow>Current phase</Eyebrow>
          <span className="text-[10px]" style={{ color: MUTED }}>Phase {currentPhase.index} / 3</span>
        </div>
        <div className="mt-2 text-base font-medium" style={{ color: INK }}>{currentPhase.label}</div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${(currentPhase.index / 3) * 100}%`,
              background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)`,
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: MUTED }}>
          <span>Foundation</span><span>Core</span><span>Scale</span>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: `${color}22`, border: `1px solid ${color}66` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
                {KIND_LABEL[selected.kind]}
              </div>
              <div className="text-sm font-medium leading-tight" style={{ color: INK }}>{selected.title}</div>
            </div>
          </div>
          <StatusPill status={selected.status} />
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: "#B9C3D6" }}>{selected.summary}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt style={{ color: MUTED }}>Owner</dt>
            <dd className="mt-1"><OwnerChip owner={selected.owner} /></dd>
          </div>
          <div>
            <dt style={{ color: MUTED }}>Date</dt>
            <dd className="mt-1" style={{ color: INK }}>{fmtDate(selected.date)}</dd>
          </div>
          <div>
            <dt style={{ color: MUTED }}>Countdown</dt>
            <dd className="mt-1" style={{ color: days <= 14 ? GOLD : INK }}>
              {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days} days`}
            </dd>
          </div>
          <div>
            <dt style={{ color: MUTED }}>Status</dt>
            <dd className="mt-1" style={{ color: INK }}>
              {selected.status.replace("_", " ")}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex gap-2">
          <button
            className="flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors"
            style={{ background: GOLD, color: NAVY }}
          >
            {selected.owner === "CLIENT" ? "Mark decided" : "Request update"}
          </button>
          <button
            className="rounded-md border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "rgba(200,169,126,0.35)", color: GOLD_SOFT }}
          >
            Discuss
          </button>
        </div>
      </Panel>

      {selected.updates && selected.updates.length > 0 && (
        <Panel>
          <Eyebrow>Latest updates</Eyebrow>
          <ul className="mt-3 space-y-3">
            {selected.updates.map((u, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: GOLD }} />
                <div>
                  <div style={{ color: INK }}>{u.text}</div>
                  <div className="mt-0.5" style={{ color: MUTED }}>{u.at}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

// ---------- Small primitives ----------

function Panel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: accent ? "rgba(200,169,126,0.35)" : "rgba(200,169,126,0.15)",
        background: accent
          ? `linear-gradient(180deg, rgba(200,169,126,0.08) 0%, rgba(15,26,46,0.6) 100%)`
          : "rgba(15,26,46,0.55)",
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "gold" }) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.22em] font-medium"
      style={{ color: tone === "gold" ? GOLD : MUTED }}
    >
      {children}
    </div>
  );
}

function OwnerChip({ owner }: { owner: Owner }) {
  const isClient = owner === "CLIENT";
  const Icon = isClient ? User : Users;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide"
      style={{
        background: isClient ? "rgba(200,169,126,0.14)" : "rgba(59,130,246,0.14)",
        color: isClient ? GOLD : "#93B4FF",
        border: `1px solid ${isClient ? "rgba(200,169,126,0.35)" : "rgba(59,130,246,0.35)"}`,
      }}
    >
      <Icon className="h-2.5 w-2.5" />
      {owner}
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; bg: string; fg: string; border: string }> = {
    completed: { label: "Completed", bg: "rgba(74,222,128,0.12)", fg: "#86EFAC", border: "rgba(74,222,128,0.35)" },
    in_progress: { label: "In progress", bg: "rgba(200,169,126,0.14)", fg: GOLD, border: "rgba(200,169,126,0.4)" },
    upcoming: { label: "Upcoming", bg: "rgba(139,151,174,0.12)", fg: MUTED, border: "rgba(139,151,174,0.3)" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}
