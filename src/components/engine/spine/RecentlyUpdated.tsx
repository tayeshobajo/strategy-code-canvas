import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wraps a Spine field so recent edits (within 24h) render with the cream
 * "recently updated" background + a small caption telling you who touched it.
 *
 * Uses the `.field-recently-updated` utility declared in styles.css so the
 * palette stays on-token.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Date.now() - then;
  const m = Math.max(1, Math.round(diff / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function wasRecentlyUpdated(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < WINDOW_MS;
}

export function RecentlyUpdated({
  updatedAt,
  updatedBy,
  children,
  label,
  className,
}: {
  updatedAt: string | null | undefined;
  updatedBy: "ai_pm" | "human" | string | null | undefined;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const highlight = wasRecentlyUpdated(updatedAt);
  const isAi = updatedBy === "ai_pm" || updatedBy === "ai";
  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        highlight ? "field-recently-updated p-2 -m-2" : "",
        className,
      )}
      data-recently-updated={highlight ? "true" : "false"}
    >
      {children}
      {highlight && updatedAt ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[#8a6713]">
          {isAi ? <Sparkles className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
          <span>
            {label ?? (isAi ? "Updated by AI PM" : "Updated")} · {relative(updatedAt)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
