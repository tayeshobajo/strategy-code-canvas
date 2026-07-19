import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Cell = { label: string; value: ReactNode; tone?: "ok" | "warn" | "bad" | "neutral" };

export function IdentityStrip({ cells }: { cells: Cell[] }) {
  return (
    <section
      aria-label="Project identity"
      className="rounded-2xl border border-[#E8E1D6] bg-white px-6 py-4 shadow-[0_1px_0_rgba(10,15,31,0.03),0_8px_24px_-16px_rgba(10,15,31,0.12)] ring-1 ring-[#0A0F1F]/[0.03]"
    >
      <ul className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 md:grid-cols-6">
        {cells.map((c, i) => (
          <li
            key={c.label}
            className={cn(
              "min-w-0",
              i > 0 && "md:border-l md:border-[#F0EBE3] md:pl-8",
            )}
          >
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
              {c.label}
            </div>
            <div
              className={cn(
                "mt-1.5 truncate text-[13.5px] font-semibold tracking-[-0.005em]",
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
