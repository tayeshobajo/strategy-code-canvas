import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EngineProjectStatus } from "@/lib/engine.functions";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "blue" | "purple" | "green" | "orange" | "red";
}) {
  const toneClass: Record<string, string> = {
    default: "text-ink",
    blue: "text-[#2842a4]",
    purple: "text-[#5435a4]",
    green: "text-[#1f6b3b]",
    orange: "text-[#8a6713]",
    red: "text-[#a4283c]",
  };
  return (
    <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
      <div className={cn("font-display text-3xl mt-2 leading-none", toneClass[tone])}>{value}</div>
      {hint ? <div className="text-xs text-ink/60 mt-2">{hint}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl bg-card border border-border shadow-sm", className)}>
      <header className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        {right ? <div className="text-xs text-ink/60">{right}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-10 text-ink/50">
      <div className="font-display text-lg">{title}</div>
      {hint ? <div className="text-sm mt-1">{hint}</div> : null}
    </div>
  );
}

const STATUS_STYLE: Record<EngineProjectStatus | "default", string> = {
  active: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
  draft: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
  needs_review: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  approved: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
  delivered: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
  in_execution: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
  blocked: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  archived: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]",
  default: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]",
};

const STATUS_LABEL: Record<EngineProjectStatus, string> = {
  active: "Active",
  draft: "Draft",
  needs_review: "Needs Review",
  approved: "Approved",
  delivered: "Delivered",
  in_execution: "In Execution",
  blocked: "Blocked",
  archived: "Archived",
};

export function EngineStatusBadge({ status }: { status: EngineProjectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STATUS_STYLE[status] ?? STATUS_STYLE.default,
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
