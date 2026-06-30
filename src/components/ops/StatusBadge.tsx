import * as React from "react";
import { cn } from "@/lib/utils";

const SHARED =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

const TONE: Record<string, string> = {
  needs_review: "bg-[#e9eefb] text-[#2842a4] border border-[#cdd6f3]",
  in_review: "bg-[#efe9fb] text-[#5435a4] border border-[#dccdf3]",
  approved: "bg-[#e6f5ec] text-[#1f6b3b] border border-[#c4e6d2]",
  rejected: "bg-[#fbe9ec] text-[#a4283c] border border-[#f3ced5]",
  archived: "bg-[#ecedf0] text-[#5a5d70] border border-[#d6d8df]",
  delivery_pending: "bg-[#fbf3e0] text-[#8a6713] border border-[#f1e3b9]",
};

const LABEL: Record<string, string> = {
  needs_review: "needs_review",
  in_review: "in_review",
  approved: "approved",
  rejected: "rejected",
  archived: "archived",
  delivery_pending: "delivery_pending",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const s = (status ?? "needs_review").toLowerCase();
  return (
    <span className={cn(SHARED, TONE[s] ?? TONE.needs_review, className)}>
      {LABEL[s] ?? s}
    </span>
  );
}

export const STATUS_FILTERS = [
  { value: "queue", label: "Needs review or in review" },
  { value: "needs_review", label: "Needs review" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All statuses" },
] as const;
