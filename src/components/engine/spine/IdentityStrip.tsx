import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Cell = { label: string; value: ReactNode; tone?: "ok" | "warn" | "bad" | "neutral" };

export function IdentityStrip({ cells }: { cells: Cell[] }) {
  return (
    <section
      aria-label="Project identity"
      className="rounded-2xl border border-[#E8E1D6] bg-white px-5 py-3 shadow-sm ring-1 ring-black/[0.02]"
    >
      <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-6">
        {cells.map((c) => (
          <li key={c.label} className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.24em] text-[#667085]">
              {c.label}
            </div>
            <div
              className={cn(
                "mt-1 truncate text-[13px] font-semibold",
                c.tone === "ok" && "text-[#1f6b3b]",
                c.tone === "warn" && "text-[#8a6713]",
                c.tone === "bad" && "text-[#a4283c]",
                (!c.tone || c.tone === "neutral") && "text-[#0A0F1F]",
              )}
            >
              {c.value}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
